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
  markRead(id: string): Promise<void>;
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
}

export interface DeliveryRecord {
  id: string;
  notificationId: string;
  channel: NotificationChannel;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'bounced';
  externalId?: string;
  error?: string;
  attemptCount: number;
  sentAt?: Date;
  deliveredAt?: Date;
  createdAt: Date;
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
