import Redis from 'ioredis';
import type { Logger } from '@mariachi/core';
import type { Backplane, BackplaneMessage, PresenceEntry, PresenceStore } from '../types';

export interface RedisRealtimeOptions {
  url?: string;
  /** Reused for commands; a duplicate is opened for the pub/sub subscriber. */
  client?: Redis;
  prefix?: string;
  logger?: Logger;
}

function open(options: RedisRealtimeOptions): { client: Redis; owned: boolean } {
  if (options.client) return { client: options.client, owned: false };
  return { client: new Redis(options.url ?? 'redis://localhost:6379', { lazyConnect: true }), owned: true };
}

async function ensure(client: Redis): Promise<void> {
  if (client.status === 'wait' || client.status === 'end') await client.connect();
}

async function close(client: Redis): Promise<void> {
  if (client.status !== 'end') await client.quit().catch(() => client.disconnect());
}

async function ping(client: Redis): Promise<boolean> {
  try {
    return (await client.ping()) === 'PONG';
  } catch {
    return false;
  }
}

/** Redis pub/sub backplane: every instance receives every fan-out message and delivers locally. */
export class RedisBackplane implements Backplane {
  private readonly pub: Redis;
  private readonly sub: Redis;
  private readonly owned: boolean;
  private readonly channel: string;
  private handler?: (m: BackplaneMessage) => void;

  constructor(private readonly options: RedisRealtimeOptions = {}) {
    const { client, owned } = open(options);
    this.pub = client;
    this.owned = owned;
    this.sub = client.duplicate({ lazyConnect: true });
    this.channel = `${options.prefix ?? 'mariachi.realtime'}:backplane`;
    this.sub.on('message', (_channel: string, raw: string) => {
      try {
        this.handler?.(JSON.parse(raw) as BackplaneMessage);
      } catch (error) {
        this.options.logger?.warn({ error: (error as Error).message }, 'dropping malformed backplane message');
      }
    });
  }

  async publish(message: BackplaneMessage): Promise<void> {
    await this.pub.publish(this.channel, JSON.stringify(message));
  }

  onMessage(handler: (message: BackplaneMessage) => void): void {
    this.handler = handler;
  }

  async connect(): Promise<void> {
    await ensure(this.pub);
    await ensure(this.sub);
    await this.sub.subscribe(this.channel);
  }

  async disconnect(): Promise<void> {
    await close(this.sub);
    if (this.owned) await close(this.pub);
  }

  isHealthy(): Promise<boolean> {
    return ping(this.pub);
  }
}

// KEYS[1] = user connections zset, KEYS[2] = tenant online-users zset
// ARGV: now, expiresAt, connectionId, userId, keyTtlMs
const ADD = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
redis.call('PEXPIRE', KEYS[1], ARGV[5])
redis.call('ZADD', KEYS[2], 'GT', ARGV[2], ARGV[4])
redis.call('PEXPIRE', KEYS[2], ARGV[5])
return redis.call('ZCARD', KEYS[1])
`;

const TOUCH = `
if redis.call('ZSCORE', KEYS[1], ARGV[3]) then
  redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
  redis.call('PEXPIRE', KEYS[1], ARGV[5])
  redis.call('ZADD', KEYS[2], 'GT', ARGV[2], ARGV[4])
  redis.call('PEXPIRE', KEYS[2], ARGV[5])
end
return 1
`;

const REMOVE = `
redis.call('ZREM', KEYS[1], ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if redis.call('ZCARD', KEYS[1]) == 0 then
  redis.call('ZREM', KEYS[2], ARGV[3])
end
return 1
`;

/**
 * Presence in Redis sorted sets scored by expiry. Heartbeats push the expiry forward, so entries
 * from crashed instances age out without cleanup jobs. Everything is tenant-scoped.
 */
export class RedisPresenceStore implements PresenceStore {
  private readonly redis: Redis;
  private readonly owned: boolean;
  private readonly prefix: string;

  constructor(options: RedisRealtimeOptions = {}) {
    const { client, owned } = open(options);
    this.redis = client;
    this.owned = owned;
    this.prefix = options.prefix ?? 'mariachi.realtime';
  }

  private tenantKey(tenantId: string | null): string {
    return tenantId === null ? '_' : encodeURIComponent(tenantId);
  }

  private connsKey(tenantId: string | null, userId: string): string {
    return `${this.prefix}:presence:${this.tenantKey(tenantId)}:user:${encodeURIComponent(userId)}`;
  }

  private onlineKey(tenantId: string | null): string {
    return `${this.prefix}:presence:${this.tenantKey(tenantId)}:online`;
  }

  async add(entry: PresenceEntry, ttlMs: number): Promise<number> {
    const now = Date.now();
    const keyTtl = String(ttlMs * 2);
    return Number(
      await this.redis.eval(
        ADD,
        2,
        this.connsKey(entry.tenantId, entry.userId),
        this.onlineKey(entry.tenantId),
        String(now),
        String(now + ttlMs),
        entry.connectionId,
        entry.userId,
        keyTtl,
      ),
    );
  }

  async touch(entry: PresenceEntry, ttlMs: number): Promise<void> {
    const now = Date.now();
    await this.redis.eval(
      TOUCH,
      2,
      this.connsKey(entry.tenantId, entry.userId),
      this.onlineKey(entry.tenantId),
      String(now),
      String(now + ttlMs),
      entry.connectionId,
      entry.userId,
      String(ttlMs * 2),
    );
  }

  async remove(entry: PresenceEntry): Promise<void> {
    await this.redis.eval(
      REMOVE,
      2,
      this.connsKey(entry.tenantId, entry.userId),
      this.onlineKey(entry.tenantId),
      String(Date.now()),
      entry.connectionId,
      entry.userId,
    );
  }

  async countConnections(tenantId: string | null, userId: string): Promise<number> {
    return this.redis.zcount(this.connsKey(tenantId, userId), `(${Date.now()}`, '+inf');
  }

  async onlineUsers(tenantId: string | null): Promise<string[]> {
    return this.redis.zrangebyscore(this.onlineKey(tenantId), `(${Date.now()}`, '+inf');
  }

  async connect(): Promise<void> {
    await ensure(this.redis);
  }

  async disconnect(): Promise<void> {
    if (this.owned) await close(this.redis);
  }

  isHealthy(): Promise<boolean> {
    return ping(this.redis);
  }
}
