import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import type Redis from 'ioredis';
import { EventsError, type Logger } from '@mariachi/core';
import { decodeEnvelope, encodeEnvelope } from '../envelope';
import type { BusSubscribeOptions, BusSubscription, DeadLetter, EnvelopeHandler, EventBus, EventEnvelope } from '../types';
import { closeRedis, ensureConnected, openRedis, pingRedis } from './redis-connection';

export interface RedisStreamsOptions {
  url?: string;
  client?: Redis;
  prefix?: string;
  logger?: Logger;
  group?: string;
  maxLen?: number;
  claimIdleMs?: number;
  maxDeliveries?: number;
  blockMs?: number;
  batchSize?: number;
}

type StreamEntry = [id: string, fields: string[]];
type ReadReply = Array<[stream: string, entries: StreamEntry[]]> | null;
type PendingReply = Array<[id: string, consumer: string, idleMs: number, deliveries: number]>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One blocking reader per consumer group, reading every stream subscribed under that group. */
class GroupReader {
  readonly streams = new Map<string, Set<EnvelopeHandler>>();
  private readonly ensured = new Set<string>();
  private reader?: Redis;
  private running = false;
  private loop?: Promise<void>;
  private reclaimTimer?: NodeJS.Timeout;
  private readonly consumer = `${hostname()}-${process.pid}-${randomBytes(3).toString('hex')}`;

  constructor(
    private readonly bus: RedisStreamsEventBus,
    readonly group: string,
  ) {}

  add(stream: string, handler: EnvelopeHandler): Promise<void> {
    const set = this.streams.get(stream) ?? new Set();
    set.add(handler);
    this.streams.set(stream, set);
    return this.running ? this.ensureGroup(stream) : Promise.resolve();
  }

  remove(stream: string, handler: EnvelopeHandler): void {
    const set = this.streams.get(stream);
    set?.delete(handler);
    if (set && set.size === 0) this.streams.delete(stream);
  }

  async ensureGroup(stream: string): Promise<void> {
    if (this.ensured.has(stream)) return;
    try {
      await this.bus.redis.xgroup('CREATE', stream, this.group, '$', 'MKSTREAM');
    } catch (error) {
      if (!String((error as Error).message).includes('BUSYGROUP')) throw error;
    }
    this.ensured.add(stream);
  }

  async start(): Promise<void> {
    if (this.running) return;
    for (const stream of this.streams.keys()) await this.ensureGroup(stream);
    this.reader = this.bus.redis.duplicate();
    this.running = true;
    this.loop = this.readLoop();
    const every = Math.max(250, Math.floor(this.bus.claimIdleMs / 2));
    this.reclaimTimer = setInterval(() => {
      this.reclaim().catch((error) => this.bus.logger?.warn({ group: this.group, error: (error as Error).message }, 'stream reclaim failed'));
    }, every);
    this.reclaimTimer.unref?.();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.reclaimTimer) clearInterval(this.reclaimTimer);
    this.reader?.disconnect();
    await this.loop?.catch(() => undefined);
    this.ensured.clear();
  }

  private async readLoop(): Promise<void> {
    while (this.running) {
      const streams = [...this.streams.keys()];
      if (streams.length === 0) {
        await sleep(100);
        continue;
      }
      let reply: ReadReply;
      try {
        reply = (await this.reader!.xreadgroup(
          'GROUP',
          this.group,
          this.consumer,
          'COUNT',
          this.bus.batchSize,
          'BLOCK',
          this.bus.blockMs,
          'STREAMS',
          ...streams,
          ...streams.map(() => '>'),
        )) as ReadReply;
      } catch (error) {
        if (!this.running) return;
        const message = String((error as Error).message);
        if (message.includes('NOGROUP')) this.ensured.clear();
        this.bus.logger?.warn({ group: this.group, error: message }, 'stream read failed; retrying');
        await sleep(500);
        for (const s of this.streams.keys()) await this.ensureGroup(s).catch(() => undefined);
        continue;
      }
      for (const [stream, entries] of reply ?? []) {
        for (const [id, fields] of entries) await this.process(stream, id, fields, 1);
      }
    }
  }

  private async process(stream: string, id: string, fields: string[], attempt: number): Promise<void> {
    const handlers = this.streams.get(stream);
    let envelope: EventEnvelope;
    try {
      envelope = decodeEnvelope(fields[1] ?? '');
    } catch (error) {
      this.bus.logger?.warn({ stream, id, error: (error as Error).message }, 'dead-lettering malformed stream entry');
      await this.bus.deadLetterRaw(stream, this.group, id, fields, 'events/malformed', attempt);
      await this.bus.redis.xack(stream, this.group, id);
      return;
    }
    if (!handlers?.size) return;
    try {
      await Promise.all([...handlers].map((h) => h(envelope, { attempt })));
      await this.bus.redis.xack(stream, this.group, id);
    } catch (error) {
      // Left pending: reclaimed and redelivered after claimIdleMs.
      this.bus.logger?.error({ stream, id, attempt, error: (error as Error).message }, 'stream delivery failed');
    }
  }

  private async reclaim(): Promise<void> {
    for (const stream of this.streams.keys()) {
      const pending = (await this.bus.redis.call(
        'XPENDING',
        stream,
        this.group,
        'IDLE',
        String(this.bus.claimIdleMs),
        '-',
        '+',
        '100',
      )) as PendingReply;
      for (const [id, , , deliveries] of pending) {
        if (!this.running) return;
        if (deliveries >= this.bus.maxDeliveries) {
          const [entry] = (await this.bus.redis.xrange(stream, id, id)) as StreamEntry[];
          await this.bus.deadLetterRaw(stream, this.group, id, entry?.[1] ?? [], 'events/max-deliveries', deliveries);
          await this.bus.redis.xack(stream, this.group, id);
          continue;
        }
        const claimed = (await this.bus.redis.xclaim(stream, this.group, this.consumer, this.bus.claimIdleMs, id)) as StreamEntry[];
        for (const [cid, fields] of claimed) {
          if (fields) await this.process(stream, cid, fields, deliveries + 1);
        }
      }
    }
  }
}

/**
 * Redis Streams with consumer groups: at-least-once delivery that survives restarts. Each group
 * receives every event once; instances in the same group share the load. Unacknowledged entries
 * are reclaimed from crashed consumers after `claimIdleMs`, and after `maxDeliveries` they move to
 * `<prefix>:dead-letter`. Handlers must be idempotent (dedupe on `meta.id`).
 */
export class RedisStreamsEventBus implements EventBus {
  readonly name = 'redis-streams';
  readonly guarantee = 'at-least-once' as const;
  readonly redis: Redis;
  readonly logger?: Logger;
  readonly claimIdleMs: number;
  readonly maxDeliveries: number;
  readonly blockMs: number;
  readonly batchSize: number;
  private readonly owned: boolean;
  private readonly prefix: string;
  private readonly defaultGroup: string;
  private readonly maxLen: number;
  private readonly groups = new Map<string, GroupReader>();
  private connected = false;

  constructor(options: RedisStreamsOptions = {}) {
    const { client, owned } = openRedis(options.url, options.client);
    this.redis = client;
    this.owned = owned;
    this.prefix = options.prefix ?? 'mariachi.events';
    this.logger = options.logger;
    this.defaultGroup = options.group ?? 'default';
    this.maxLen = options.maxLen ?? 100_000;
    this.claimIdleMs = options.claimIdleMs ?? 30_000;
    this.maxDeliveries = options.maxDeliveries ?? 10;
    this.blockMs = options.blockMs ?? 2_000;
    this.batchSize = options.batchSize ?? 32;
  }

  get deadLetterStream(): string {
    return `${this.prefix}:dead-letter`;
  }

  private stream(eventName: string): string {
    return `${this.prefix}:${eventName}`;
  }

  async publish(envelope: EventEnvelope): Promise<void> {
    if (!this.connected) throw new EventsError('events/not-connected', 'Event bus is not connected');
    await this.redis.xadd(this.stream(envelope.type), 'MAXLEN', '~', String(this.maxLen), '*', 'e', encodeEnvelope(envelope));
  }

  subscribe(eventName: string, handler: EnvelopeHandler, options: BusSubscribeOptions = {}): BusSubscription {
    const group = options.group ?? this.defaultGroup;
    let reader = this.groups.get(group);
    if (!reader) {
      reader = new GroupReader(this, group);
      this.groups.set(group, reader);
    }
    const stream = this.stream(eventName);
    const r = reader;
    const ready = r.add(stream, handler).then(() => (this.connected ? r.start() : undefined));
    return {
      ready,
      unsubscribe: async () => r.remove(stream, handler),
    };
  }

  async connect(): Promise<void> {
    await ensureConnected(this.redis);
    this.connected = true;
    for (const reader of this.groups.values()) await reader.start();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    await Promise.all([...this.groups.values()].map((g) => g.stop()));
    if (this.owned) await closeRedis(this.redis);
  }

  isHealthy(): Promise<boolean> {
    return pingRedis(this.redis);
  }

  /** @internal */
  async deadLetterRaw(stream: string, group: string, id: string, fields: string[], code: string, attempts: number): Promise<void> {
    let envelope: EventEnvelope | undefined;
    try {
      envelope = decodeEnvelope(fields[1] ?? '');
    } catch {
      envelope = undefined;
    }
    const entry: DeadLetter & { stream: string; streamId: string; raw?: string } = {
      envelope: envelope ?? ({ id, type: stream.slice(this.prefix.length + 1), payload: null } as EventEnvelope),
      subscriber: `${group}:${stream}`,
      error: { code, message: code === 'events/malformed' ? 'Malformed stream entry' : `Exceeded ${this.maxDeliveries} deliveries` },
      attempts,
      failedAt: new Date().toISOString(),
      stream,
      streamId: id,
      raw: envelope ? undefined : fields[1],
    };
    await this.redis.xadd(this.deadLetterStream, 'MAXLEN', '~', String(this.maxLen), '*', 'd', JSON.stringify(entry));
  }
}
