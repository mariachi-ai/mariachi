import type {
  Logger, Context, TracerAdapter, MetricsAdapter, Instrumentable,
} from '@mariachi/core';
import { withSpan, getContainer, KEYS, NotificationError } from '@mariachi/core';
import type {
  EmailAdapter, EmailMessage, NotificationTemplate,
  NotificationChannel, NotificationIntent,
  SMSAdapter, PushAdapter,
  InAppNotification, InAppNotificationStore,
  NotificationPreferencesStore,
} from './types';
import { renderTemplate } from './template';

export interface NotificationsConfig {
  email: EmailAdapter;
  sms?: SMSAdapter;
  push?: PushAdapter;
  inApp?: InAppNotificationStore;
  preferences?: NotificationPreferencesStore;
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

  constructor(config: NotificationsConfig) {
    const container = getContainer();
    this.logger = container.resolve<Logger>(KEYS.Logger);
    this.tracer = container.has(KEYS.Tracer) ? container.resolve<TracerAdapter>(KEYS.Tracer) : undefined;
    this.metrics = container.has(KEYS.Metrics) ? container.resolve<MetricsAdapter>(KEYS.Metrics) : undefined;
    this.email = config.email;
    this.sms = config.sms;
    this.push = config.push;
    this.inApp = config.inApp;
    this.preferences = config.preferences;
  }

  async notify(ctx: Context, intent: NotificationIntent): Promise<string> {
    return withSpan(this.tracer, 'notifications.notify', {
      userId: intent.recipientUserId,
      category: intent.category,
    }, async () => {
      const notificationId = crypto.randomUUID();

      const channels = intent.channels
        ?? await this.resolveChannels(ctx, intent.recipientUserId, intent.recipientTenantId, intent.category);

      this.logger.info({
        traceId: ctx.traceId,
        notificationId,
        userId: intent.recipientUserId,
        category: intent.category,
        channels,
      }, 'Routing notification');

      const rendered = renderTemplate(intent.template, intent.variables);

      for (const channel of channels) {
        await this.dispatchToChannel(ctx, notificationId, channel, intent, rendered);
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
    const rendered = renderTemplate(template, variables);
    return this.sendEmail(ctx, { to, subject: rendered.subject, html: rendered.body });
  }

  private async resolveChannels(_ctx: Context, userId: string, tenantId: string, category: string): Promise<NotificationChannel[]> {
    if (this.preferences) {
      const channels = await this.preferences.getChannels(userId, tenantId, category);
      if (channels.length > 0) return channels;
    }
    return ['email', 'in_app'];
  }

  private async dispatchToChannel(
    ctx: Context,
    notificationId: string,
    channel: NotificationChannel,
    intent: NotificationIntent,
    rendered: { subject: string; body: string },
  ): Promise<void> {
    this.logger.debug({
      traceId: ctx.traceId,
      notificationId,
      channel,
      userId: intent.recipientUserId,
    }, 'Dispatching to channel');
    this.metrics?.increment('notifications.dispatched', 1, { channel, category: intent.category });
    await this.onChannelDispatched?.(ctx, notificationId, channel, intent);
  }

  protected onNotificationRouted?(ctx: Context, notificationId: string, channels: NotificationChannel[]): Promise<void>;
  protected onNotificationSent?(ctx: Context, channel: NotificationChannel, recipient: string): Promise<void>;
  protected onNotificationFailed?(ctx: Context, channel: NotificationChannel, error: Error): Promise<void>;
  protected onChannelDispatched?(ctx: Context, notificationId: string, channel: NotificationChannel, intent: NotificationIntent): Promise<void>;
  protected onInAppCreated?(ctx: Context, notification: InAppNotification): Promise<void>;
}

export class DefaultNotifications extends Notifications {}
