import { and, desc, eq, sql } from 'drizzle-orm';
import { compileTable, type DrizzleDb } from '@mariachi/database-postgres';
import { notificationDeliveriesTable } from '../schema/deliveries';
import { notificationsTable } from '../schema/notifications';
import { notificationPreferencesTable } from '../schema/preferences';
import type {
  DeliveryRecord,
  DeliveryStore,
  InAppNotification,
  InAppNotificationStore,
  NotificationChannel,
  NotificationPreferencesStore,
} from '../types';

const notifications = compileTable(notificationsTable);
const preferences = compileTable(notificationPreferencesTable);
const deliveries = compileTable(notificationDeliveriesTable);

const DEFAULT_CHANNELS: NotificationChannel[] = ['email', 'in_app'];

/**
 * Postgres inbox, preferences and delivery log. Requires the tables from
 * `@mariachi/notifications/schema`.
 */
export class DrizzleNotificationStore implements InAppNotificationStore, NotificationPreferencesStore, DeliveryStore {
  constructor(private readonly db: DrizzleDb) {}

  async create(notification: Omit<InAppNotification, 'id' | 'read' | 'createdAt'>): Promise<InAppNotification> {
    const [row] = await this.db
      .insert(notifications)
      .values({
        tenantId: notification.tenantId ?? '',
        userId: notification.userId,
        type: notification.type,
        channel: 'in_app',
        title: notification.title,
        body: notification.body,
        metadata: notification.metadata ?? null,
      })
      .returning();
    return toInApp(row);
  }

  async markRead(id: string, userId: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ read: true, readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }

  async markAllRead(userId: string, tenantId?: string): Promise<void> {
    const where = tenantId
      ? and(eq(notifications.userId, userId), eq(notifications.tenantId, tenantId))
      : eq(notifications.userId, userId);
    await this.db.update(notifications).set({ read: true, readAt: new Date() }).where(where);
  }

  async findUnread(userId: string, tenantId?: string): Promise<InAppNotification[]> {
    const where = tenantId
      ? and(eq(notifications.userId, userId), eq(notifications.tenantId, tenantId), eq(notifications.read, false))
      : and(eq(notifications.userId, userId), eq(notifications.read, false));
    const rows = await this.db.select().from(notifications).where(where).orderBy(desc(notifications.createdAt));
    return rows.map(toInApp);
  }

  async getChannels(userId: string, tenantId: string, category: string): Promise<NotificationChannel[]> {
    const rows = await this.db
      .select()
      .from(preferences)
      .where(and(eq(preferences.userId, userId), eq(preferences.tenantId, tenantId), eq(preferences.category, category)));
    if (rows.length === 0) return [...DEFAULT_CHANNELS];
    return rows.filter((r) => r.enabled).map((r) => r.channel as NotificationChannel);
  }

  /** Writes all four channels in one upsert, so a concurrent change cannot leave a mix. */
  async setChannels(userId: string, tenantId: string, category: string, channels: NotificationChannel[]): Promise<void> {
    const all: NotificationChannel[] = ['email', 'sms', 'push', 'in_app'];
    await this.db
      .insert(preferences)
      .values(all.map((channel) => ({ tenantId, userId, channel, category, enabled: channels.includes(channel) })))
      .onConflictDoUpdate({
        target: [preferences.tenantId, preferences.userId, preferences.channel, preferences.category],
        set: { enabled: sql`excluded.enabled`, updatedAt: new Date() },
      });
  }

  async record(input: Omit<DeliveryRecord, 'id' | 'createdAt'>): Promise<DeliveryRecord> {
    const values = {
      notificationId: input.notificationId,
      tenantId: input.tenantId ?? '',
      userId: input.userId ?? '',
      channel: input.channel,
      status: input.status,
      externalId: input.externalId ?? null,
      error: input.error ?? null,
      attemptCount: input.attemptCount,
      sentAt: input.sentAt ?? null,
      deliveredAt: input.deliveredAt ?? null,
      updatedAt: new Date(),
    };
    const [row] = await this.db
      .insert(deliveries)
      .values(values)
      .onConflictDoUpdate({ target: [deliveries.notificationId, deliveries.channel], set: values })
      .returning();
    return toDelivery(row);
  }

  async get(notificationId: string, channel: NotificationChannel): Promise<DeliveryRecord | null> {
    const [row] = await this.db
      .select()
      .from(deliveries)
      .where(and(eq(deliveries.notificationId, notificationId), eq(deliveries.channel, channel)))
      .limit(1);
    return row ? toDelivery(row) : null;
  }

  async list(notificationId: string): Promise<DeliveryRecord[]> {
    const rows = await this.db.select().from(deliveries).where(eq(deliveries.notificationId, notificationId));
    return rows.map(toDelivery);
  }

  async updateByExternalId(externalId: string, patch: { status: DeliveryRecord['status']; error?: string; deliveredAt?: Date }): Promise<boolean> {
    const rows = await this.db
      .update(deliveries)
      .set({ status: patch.status, error: patch.error ?? null, deliveredAt: patch.deliveredAt ?? null, updatedAt: new Date() })
      .where(eq(deliveries.externalId, externalId))
      .returning({ id: deliveries.id });
    return rows.length > 0;
  }
}

function toInApp(row: Record<string, any>): InAppNotification {
  return {
    id: row.id,
    userId: row.userId,
    tenantId: row.tenantId,
    title: row.title,
    body: row.body,
    type: row.type,
    read: row.read,
    createdAt: row.createdAt,
    metadata: row.metadata ?? undefined,
  };
}

function toDelivery(row: Record<string, any>): DeliveryRecord {
  return {
    id: row.id,
    notificationId: row.notificationId,
    tenantId: row.tenantId,
    userId: row.userId,
    channel: row.channel,
    status: row.status,
    externalId: row.externalId ?? undefined,
    error: row.error ?? undefined,
    attemptCount: row.attemptCount,
    sentAt: row.sentAt ?? undefined,
    deliveredAt: row.deliveredAt ?? undefined,
    createdAt: row.createdAt,
  };
}
