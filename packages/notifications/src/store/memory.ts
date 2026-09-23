import type {
  DeliveryRecord,
  DeliveryStore,
  InAppNotification,
  InAppNotificationStore,
  NotificationChannel,
  NotificationPreferencesStore,
} from '../types';

const DEFAULT_CHANNELS: NotificationChannel[] = ['email', 'in_app'];

/** Process-local in-app inbox. */
export class MemoryInAppStore implements InAppNotificationStore {
  readonly items: InAppNotification[] = [];

  async create(notification: Omit<InAppNotification, 'id' | 'read' | 'createdAt'>): Promise<InAppNotification> {
    const created: InAppNotification = { ...notification, id: crypto.randomUUID(), read: false, createdAt: new Date() };
    this.items.push(created);
    return created;
  }

  async markRead(id: string, userId: string): Promise<void> {
    const item = this.items.find((n) => n.id === id && n.userId === userId);
    if (item) item.read = true;
  }

  async markAllRead(userId: string, tenantId?: string): Promise<void> {
    for (const item of this.items) {
      if (item.userId === userId && (tenantId === undefined || item.tenantId === tenantId)) item.read = true;
    }
  }

  async findUnread(userId: string, tenantId?: string): Promise<InAppNotification[]> {
    return this.items.filter((n) => n.userId === userId && !n.read && (tenantId === undefined || n.tenantId === tenantId));
  }
}

/**
 * Enabled channels per user, tenant and category. Missing rows mean the defaults
 * (`email` and `in_app`). An explicit empty list is a full opt-out.
 */
export class MemoryPreferenceStore implements NotificationPreferencesStore {
  private readonly channels = new Map<string, NotificationChannel[]>();
  private readonly explicit = new Set<string>();

  private key(userId: string, tenantId: string, category: string): string {
    return `${userId}:${tenantId}:${category}`;
  }

  async getChannels(userId: string, tenantId: string, category: string): Promise<NotificationChannel[]> {
    const key = this.key(userId, tenantId, category);
    if (!this.explicit.has(key)) return [...DEFAULT_CHANNELS];
    return [...(this.channels.get(key) ?? [])];
  }

  async setChannels(userId: string, tenantId: string, category: string, channels: NotificationChannel[]): Promise<void> {
    const key = this.key(userId, tenantId, category);
    this.explicit.add(key);
    this.channels.set(key, [...channels]);
  }
}

export class MemoryDeliveryStore implements DeliveryStore {
  readonly records: DeliveryRecord[] = [];

  async record(input: Omit<DeliveryRecord, 'id' | 'createdAt'>): Promise<DeliveryRecord> {
    const existing = this.records.find((r) => r.notificationId === input.notificationId && r.channel === input.channel);
    if (existing) {
      Object.assign(existing, input);
      return existing;
    }
    const created: DeliveryRecord = { ...input, id: crypto.randomUUID(), createdAt: new Date() };
    this.records.push(created);
    return created;
  }

  async get(notificationId: string, channel: NotificationChannel): Promise<DeliveryRecord | null> {
    return this.records.find((r) => r.notificationId === notificationId && r.channel === channel) ?? null;
  }

  async list(notificationId: string): Promise<DeliveryRecord[]> {
    return this.records.filter((r) => r.notificationId === notificationId);
  }

  async updateByExternalId(externalId: string, patch: { status: DeliveryRecord['status']; error?: string; deliveredAt?: Date }): Promise<boolean> {
    const record = this.records.find((r) => r.externalId === externalId);
    if (!record) return false;
    Object.assign(record, patch);
    return true;
  }
}
