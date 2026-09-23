import type { Context } from '@mariachi/core';
export interface NotificationsConfig {
  email?: {
    adapter: string;
    apiKey?: string;
    from?: string;
  };
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  templateId?: string;
  templateData?: Record<string, unknown>;
}

export interface EmailAdapter {
  send(message: EmailMessage): Promise<{ id: string }>;
}

export interface InAppNotification {
  id: string;
  userId: string;
  tenantId?: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  channel: 'email' | 'sms' | 'push' | 'in_app';
}

export interface RenderedNotification {
  subject: string;
  body: string;
}

export interface InAppNotificationStore {
  create(
    notification: Omit<InAppNotification, 'id' | 'read' | 'createdAt'>
  ): Promise<InAppNotification>;
  /** Marks one notification read. Only the recipient (`userId`) can; other ids are ignored. */
  markRead(id: string, userId: string): Promise<void>;
  markAllRead(userId: string, tenantId?: string): Promise<void>;
  findUnread(userId: string, tenantId?: string): Promise<InAppNotification[]>;
}

export type NotificationChannel = 'email' | 'sms' | 'push' | 'in_app';

export interface NotificationIntent {
  recipientUserId: string;
  recipientTenantId: string;
  category: string;
  template: NotificationTemplate;
  variables: Record<string, string>;
  channels?: NotificationChannel[];
  priority?: 'critical' | 'high' | 'normal' | 'low';
  idempotencyKey?: string;
  /** Destination address. Falls back to `variables.email` / `variables.phone` / `variables.pushToken`. */
  email?: string;
  phone?: string;
  pushToken?: string;
}

/** One channel delivery, enqueued as its own job so retries stay per channel. */
export interface NotificationJob {
  notificationId: string;
  channel: NotificationChannel;
  recipientUserId: string;
  recipientTenantId: string;
  category: string;
  to?: string;
  subject: string;
  body: string;
  traceId: string;
  tenantId: string | null;
  userId: string | null;
}

/**
 * Where per-channel jobs go. `DefaultJobs` from `@mariachi/jobs` fits as is; retries come from the
 * `notifications.dispatch` job definition.
 */
export interface NotificationQueue {
  enqueue(ctx: Context, name: string, data: NotificationJob, options?: { dedupKey?: string }): Promise<string>;
}

export const NOTIFICATION_DISPATCH_JOB = 'notifications.dispatch';

export interface DeliveryRecord {
  id: string;
  notificationId: string;
  tenantId?: string;
  userId?: string;
  channel: NotificationChannel;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'bounced';
  externalId?: string;
  error?: string;
  attemptCount: number;
  sentAt?: Date;
  deliveredAt?: Date;
  createdAt: Date;
}

/** One row per notification and channel, updated as attempts happen. */
export interface DeliveryStore {
  /** Creates or replaces the row for (`notificationId`, `channel`). */
  record(input: Omit<DeliveryRecord, 'id' | 'createdAt'>): Promise<DeliveryRecord>;
  get(notificationId: string, channel: NotificationChannel): Promise<DeliveryRecord | null>;
  list(notificationId: string): Promise<DeliveryRecord[]>;
  /** For provider status callbacks (delivered, bounced). Returns false when no row has that id. */
  updateByExternalId(externalId: string, patch: { status: DeliveryRecord['status']; error?: string; deliveredAt?: Date }): Promise<boolean>;
}

export interface SMSAdapter {
  send(to: string, body: string): Promise<{ id: string }>;
}

export interface PushAdapter {
  send(token: string, title: string, body: string, data?: Record<string, string>): Promise<{ id: string }>;
}

export interface NotificationPreferencesStore {
  getChannels(userId: string, tenantId: string, category: string): Promise<NotificationChannel[]>;
  setChannels(userId: string, tenantId: string, category: string, channels: NotificationChannel[]): Promise<void>;
}
