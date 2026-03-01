import Redis from 'ioredis';

export interface ConnectionStoreConfig {
  redisUrl: string;
  prefix?: string;
  connectionTtlSeconds?: number;
}

export class ConnectionStore {
  private readonly redis: Redis;
  private readonly prefix: string;
  private readonly ttl: number;

  constructor(config: ConnectionStoreConfig) {
    this.redis = new Redis(config.redisUrl);
    this.prefix = config.prefix ?? 'realtime';
    this.ttl = config.connectionTtlSeconds ?? 3600;
  }

  async addConnection(connectionId: string, userId: string, tenantId: string): Promise<void> {
    const key = `${this.prefix}:conn:${connectionId}`;
    await this.redis.hset(key, { userId, tenantId, connectedAt: new Date().toISOString() });
    await this.redis.expire(key, this.ttl);
    await this.redis.sadd(`${this.prefix}:user:${userId}:conns`, connectionId);
  }

  async removeConnection(connectionId: string, userId: string): Promise<void> {
    await this.redis.del(`${this.prefix}:conn:${connectionId}`);
    await this.redis.srem(`${this.prefix}:user:${userId}:conns`, connectionId);
    const channels = await this.redis.smembers(`${this.prefix}:conn:${connectionId}:channels`);
    for (const channel of channels) {
      await this.redis.srem(`${this.prefix}:channel:${channel}:members`, connectionId);
    }
    await this.redis.del(`${this.prefix}:conn:${connectionId}:channels`);
  }

  async addToChannel(connectionId: string, channel: string): Promise<void> {
    await this.redis.sadd(`${this.prefix}:conn:${connectionId}:channels`, channel);
    await this.redis.sadd(`${this.prefix}:channel:${channel}:members`, connectionId);
  }

  async removeFromChannel(connectionId: string, channel: string): Promise<void> {
    await this.redis.srem(`${this.prefix}:conn:${connectionId}:channels`, channel);
    await this.redis.srem(`${this.prefix}:channel:${channel}:members`, connectionId);
  }

  async getChannelMembers(channel: string): Promise<string[]> {
    return this.redis.smembers(`${this.prefix}:channel:${channel}:members`);
  }

  async getUserConnections(userId: string): Promise<string[]> {
    return this.redis.smembers(`${this.prefix}:user:${userId}:conns`);
  }

  async getConnectionInfo(connectionId: string): Promise<{ userId: string; tenantId: string } | null> {
    const data = await this.redis.hgetall(`${this.prefix}:conn:${connectionId}`);
    if (!data.userId) return null;
    return { userId: data.userId, tenantId: data.tenantId };
  }

  async isUserOnline(userId: string): Promise<boolean> {
    const count = await this.redis.scard(`${this.prefix}:user:${userId}:conns`);
    return count > 0;
  }

  async getOnlineUsers(): Promise<string[]> {
    const keys = await this.redis.keys(`${this.prefix}:user:*:conns`);
    const users: string[] = [];
    for (const key of keys) {
      const count = await this.redis.scard(key);
      if (count > 0) {
        const match = key.match(/user:(.+):conns/);
        if (match) users.push(match[1]);
      }
    }
    return users;
  }

  async updatePresence(userId: string): Promise<void> {
    await this.redis.hset(`${this.prefix}:presence:${userId}`, {
      lastSeen: new Date().toISOString(),
      status: 'online',
    });
    await this.redis.expire(`${this.prefix}:presence:${userId}`, this.ttl);
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}
