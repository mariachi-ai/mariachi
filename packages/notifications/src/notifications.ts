import type {
  Logger, Context, TracerAdapter, MetricsAdapter, Instrumentable,
} from '@mariachi/core';
import { withSpan, NotificationError, resolveInstrumentation, retry, type InstrumentationDeps } from '@mariachi/core';
import type {
  EmailAdapter, EmailMessage, NotificationTemplate,
  NotificationChannel, NotificationIntent, NotificationJob, NotificationQueue,
  SMSAdapter, PushAdapter,
  InAppNotification, InAppNotificationStore,
  NotificationPreferencesStore, DeliveryStore,
} from './types';
import { NOTIFICATION_DISPATCH_JOB } from './types';
import { renderTemplate } from './template';

export interface NotificationsConfig {
  email: EmailAdapter;
  sms?: SMSAdapter;
  push?: PushAdapter;
  inApp?: InAppNotificationStore;
  preferences?: NotificationPreferencesStore;
  deliveries?: DeliveryStore;
  /** When set, each channel is enqueued instead of sent inline. The worker calls `deliverJob`. */
  queue?: NotificationQueue;
  /** Inline sends only: attempts per channel, including the first. Default 3. Queued jobs use the job's retry policy. */
  attempts?: number;
}

/** Failures that repeat on every attempt: no recipient, or the channel is not configured. */
function isPermanent(code: string): boolean {
  return code === 'notifications/missing-recipient' || code.endsWith('-not-configured');
}

export abstract class Notifications implements Instrumentable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly email: EmailAdapter;
  protected readonly sms?: SMSAdapter;
  protected readonly push?: PushAdapter;
  protected readonly inApp?: InAppNotificationStore;
  protected readonly preferences?: NotificationPreferencesStore;
  protected readonly deliveries?: DeliveryStore;
  protected readonly queue?: NotificationQueue;
  protected readonly attempts: number;

  constructor(config: NotificationsConfig, instrumentation?: InstrumentationDeps) {
    const resolved = resolveInstrumentation(instrumentation);
    this.logger = resolved.logger;
    this.tracer = resolved.tracer;
    this.metrics = resolved.metrics;
    this.email = config.email;
    this.sms = config.sms;
    this.push = config.push;
    this.inApp = config.inApp;
    this.preferences = config.preferences;
    this.deliveries = config.deliveries;
    this.queue = config.queue;
    this.attempts = config.attempts ?? 3;
  }

  async notify(ctx: Context, intent: NotificationIntent): Promise<string> {
    return withSpan(this.tracer, 'notifications.notify', {
      userId: intent.recipientUserId,
      category: intent.category,
    }, async () => {
      const notificationId = crypto.randomUUID();

      const channels = await this.resolveChannels(intent);

      this.logger.info({
        traceId: ctx.traceId,
        notificationId,
        userId: intent.recipientUserId,
        category: intent.category,
        channels,
      }, 'Routing notification');


      for (const channel of channels) {
        // Email bodies are HTML, so their values are escaped; other channels get plain text.
        const rendered = renderTemplate(intent.template, intent.variables, { html: channel === 'email' });
        const job = this.toJob(ctx, notificationId, channel, intent, rendered);
        if (this.queue) {
          // Record before enqueueing so a fast worker's 'sent' is never overwritten with 'queued'.
          await this.deliveries?.record({
            notificationId,
            tenantId: intent.recipientTenantId,
            userId: intent.recipientUserId,
            channel,
            status: 'queued',
            attemptCount: 0,
          });
          await this.queue.enqueue(ctx, NOTIFICATION_DISPATCH_JOB, job, {
            dedupKey: intent.idempotencyKey ? `${intent.idempotencyKey}:${channel}` : undefined,
          });
        } else {
          await retry(() => this.sendChannel(ctx, job), {
            attempts: this.attempts,
            backoff: 'exponential',
            baseDelayMs: 50,
            jitter: false,
            retryOn: (error) => !(error instanceof NotificationError && isPermanent(error.code)),
            onRetry: (error, attempt) => {
              this.logger.warn({ traceId: ctx.traceId, notificationId, channel, attempt, error: error.message }, 'Notification channel retry');
            },
          });
        }
      }

      this.metrics?.increment('notifications.routed', 1, { category: intent.category });
      await this.onNotificationRouted?.(ctx, notificationId, channels);
      return notificationId;
    });
  }

  async sendEmail(ctx: Context, message: EmailMessage): Promise<{ id: string }> {
    return withSpan(this.tracer, 'notifications.sendEmail', {
      to: Array.isArray(message.to) ? message.to.join(',') : message.to,
    }, async () => {
      this.logger.info({ traceId: ctx.traceId, to: message.to, subject: message.subject }, 'Sending email');
      try {
        const result = await this.email.send(message);
        this.metrics?.increment('notifications.email.sent', 1);
        await this.onNotificationSent?.(ctx, 'email', typeof message.to === 'string' ? message.to : message.to[0]);
        return result;
      } catch (error) {
        this.metrics?.increment('notifications.email.failed', 1);
        await this.onNotificationFailed?.(ctx, 'email', error as Error);
        throw new NotificationError('notifications/email-send-failed', (error as Error).message);
      }
    });
  }

  async sendSMS(ctx: Context, to: string, body: string): Promise<{ id: string }> {
    return withSpan(this.tracer, 'notifications.sendSMS', { to }, async () => {
      if (!this.sms) throw new NotificationError('notifications/sms-not-configured', 'SMS adapter not configured');
      this.logger.info({ traceId: ctx.traceId, to }, 'Sending SMS');
      try {
        const result = await this.sms.send(to, body);
        this.metrics?.increment('notifications.sms.sent', 1);
        await this.onNotificationSent?.(ctx, 'sms', to);
        return result;
      } catch (error) {
        this.metrics?.increment('notifications.sms.failed', 1);
        await this.onNotificationFailed?.(ctx, 'sms', error as Error);
        throw new NotificationError('notifications/sms-send-failed', (error as Error).message);
      }
    });
  }

  async sendPush(ctx: Context, token: string, title: string, body: string, data?: Record<string, string>): Promise<{ id: string }> {
    return withSpan(this.tracer, 'notifications.sendPush', {}, async () => {
      if (!this.push) throw new NotificationError('notifications/push-not-configured', 'Push adapter not configured');
      this.logger.info({ traceId: ctx.traceId }, 'Sending push notification');
      try {
        const result = await this.push.send(token, title, body, data);
        this.metrics?.increment('notifications.push.sent', 1);
        await this.onNotificationSent?.(ctx, 'push', token);
        return result;
      } catch (error) {
        this.metrics?.increment('notifications.push.failed', 1);
        await this.onNotificationFailed?.(ctx, 'push', error as Error);
        throw new NotificationError('notifications/push-send-failed', (error as Error).message);
      }
    });
  }

  async sendInApp(ctx: Context, notification: Omit<InAppNotification, 'id' | 'read' | 'createdAt'>): Promise<InAppNotification> {
    return withSpan(this.tracer, 'notifications.sendInApp', { userId: notification.userId }, async () => {
      if (!this.inApp) throw new NotificationError('notifications/inapp-not-configured', 'In-app store not configured');
      this.logger.info({ traceId: ctx.traceId, userId: notification.userId }, 'Creating in-app notification');
      const created = await this.inApp.create(notification);
      this.metrics?.increment('notifications.inapp.sent', 1);
      await this.onNotificationSent?.(ctx, 'in_app', notification.userId);
      await this.onInAppCreated?.(ctx, created);
      return created;
    });
  }

  async sendTemplatedEmail(ctx: Context, template: NotificationTemplate, variables: Record<string, string>, to: string | string[]): Promise<{ id: string }> {
    const rendered = renderTemplate(template, variables, { html: true });
    return this.sendEmail(ctx, { to, subject: rendered.subject, html: rendered.body });
  }

  /**
   * Worker entrypoint for `notifications.dispatch` jobs. Makes one attempt; the job queue owns
   * retries (`attempts` is passed when enqueueing). A channel already sent is skipped.
   */
  async deliverJob(ctx: Context, job: NotificationJob): Promise<void> {
    await this.sendChannel(ctx, job);
  }

  private async resolveChannels(intent: NotificationIntent): Promise<NotificationChannel[]> {
    const fallback: NotificationChannel[] = ['email', 'in_app'];
    const preferred = this.preferences
      ? await this.preferences.getChannels(intent.recipientUserId, intent.recipientTenantId, intent.category)
      : undefined;
    if (!intent.channels) {
      // Preferences decide; an explicit empty list is an opt-out unless the message is critical.
      if (!preferred) return fallback;
      return preferred.length > 0 || intent.priority !== 'critical' ? preferred : fallback;
    }
    if (!preferred || intent.priority === 'critical') return intent.channels;
    const allowed = new Set(preferred);
    return intent.channels.filter((channel) => allowed.has(channel));
  }

  private toJob(
    ctx: Context,
    notificationId: string,
    channel: NotificationChannel,
    intent: NotificationIntent,
    rendered: { subject: string; body: string },
  ): NotificationJob {
    const to = channel === 'email'
      ? intent.email ?? intent.variables.email
      : channel === 'sms'
        ? intent.phone ?? intent.variables.phone
        : channel === 'push'
          ? intent.pushToken ?? intent.variables.pushToken
          : intent.recipientUserId;
    return {
      notificationId,
      channel,
      recipientUserId: intent.recipientUserId,
      recipientTenantId: intent.recipientTenantId,
      category: intent.category,
      to,
      subject: rendered.subject,
      body: rendered.body,
      traceId: ctx.traceId,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    };
  }

  private async sendChannel(ctx: Context, job: NotificationJob): Promise<void> {
    this.logger.debug({ traceId: ctx.traceId, notificationId: job.notificationId, channel: job.channel, userId: job.recipientUserId }, 'Dispatching to channel');
    const current = await this.deliveries?.get(job.notificationId, job.channel);
    if (current && (current.status === 'sent' || current.status === 'delivered')) {
      this.logger.info({ traceId: ctx.traceId, notificationId: job.notificationId, channel: job.channel }, 'Channel already delivered; skipping');
      return;
    }
    const attemptCount = (current?.attemptCount ?? 0) + 1;
    try {
      let externalId: string | undefined;
      if (job.channel === 'email') {
        if (!job.to) throw new NotificationError('notifications/missing-recipient', 'Email notification has no recipient');
        externalId = (await this.sendEmail(ctx, { to: job.to, subject: job.subject, html: job.body })).id;
      } else if (job.channel === 'sms') {
        if (!job.to) throw new NotificationError('notifications/missing-recipient', 'SMS notification has no recipient');
        externalId = (await this.sendSMS(ctx, job.to, job.body)).id;
      } else if (job.channel === 'push') {
        if (!job.to) throw new NotificationError('notifications/missing-recipient', 'Push notification has no token');
        externalId = (await this.sendPush(ctx, job.to, job.subject, job.body)).id;
      } else {
        await this.sendInApp(ctx, { userId: job.recipientUserId, tenantId: job.recipientTenantId, title: job.subject, body: job.body, type: job.category });
      }
      await this.deliveries?.record({
        notificationId: job.notificationId,
        tenantId: job.recipientTenantId,
        userId: job.recipientUserId,
        channel: job.channel,
        status: 'sent',
        externalId,
        attemptCount,
        sentAt: new Date(),
      });
      this.metrics?.increment('notifications.dispatched', 1, { channel: job.channel, category: job.category });
      await this.onChannelDispatched?.(ctx, job.notificationId, job.channel, {
        recipientUserId: job.recipientUserId,
        recipientTenantId: job.recipientTenantId,
        category: job.category,
        template: { id: job.category, name: job.category, subject: job.subject, body: job.body, channel: job.channel },
        variables: {},
      });
    } catch (error) {
      await this.deliveries?.record({
        notificationId: job.notificationId,
        tenantId: job.recipientTenantId,
        userId: job.recipientUserId,
        channel: job.channel,
        status: 'failed',
        error: (error as Error).message,
        attemptCount,
      });
      throw error;
    }
  }

  protected onNotificationRouted?(ctx: Context, notificationId: string, channels: NotificationChannel[]): Promise<void>;
  protected onNotificationSent?(ctx: Context, channel: NotificationChannel, recipient: string): Promise<void>;
  protected onNotificationFailed?(ctx: Context, channel: NotificationChannel, error: Error): Promise<void>;
  protected onChannelDispatched?(ctx: Context, notificationId: string, channel: NotificationChannel, intent: NotificationIntent): Promise<void>;
  protected onInAppCreated?(ctx: Context, notification: InAppNotification): Promise<void>;
}

export class DefaultNotifications extends Notifications {}
