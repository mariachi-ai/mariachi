import type Redis from 'ioredis';
import { EventsError, type Logger } from '@mariachi/core';
import { decodeEnvelope, encodeEnvelope } from '../envelope';
import type { BusSubscribeOptions, BusSubscription, EnvelopeHandler, EventBus, EventEnvelope } from '../types';
import { closeRedis, ensureConnected, openRedis, pingRedis } from './redis-connection';

export interface RedisEventBusOptions {
  url?: string;
  client?: Redis;
  prefix?: string;
  logger?: Logger;
}

/**
 * Redis pub/sub. Fire-and-forget fan-out: every subscriber on every instance receives each event,
 * and events published while a subscriber is offline are lost. Use `redis-streams` for work that
 * must not be dropped or must be shared across instances.
 */
export class RedisEventBusAdapter implements EventBus {
  readonly name = 'redis';
  readonly guarantee = 'at-most-once' as const;
  private readonly pub: Redis;
  private readonly sub: Redis;
  private readonly ownsPub: boolean;
  private readonly prefix: string;
  private readonly logger?: Logger;
  private readonly handlers = new Map<string, Set<EnvelopeHandler>>();
  private connected = false;

  constructor(options: RedisEventBusOptions = {}) {
    const { client, owned } = openRedis(options.url, options.client);
    this.pub = client;
    this.ownsPub = owned;
    this.sub = client.duplicate({ lazyConnect: true });
    this.prefix = options.prefix ?? 'mariachi.events';
    this.logger = options.logger;
    this.sub.on('message', (channel: string, message: string) => this.dispatch(channel, message));
  }

  private channel(eventName: string): string {
    return `${this.prefix}:${eventName}`;
  }

  private dispatch(channel: string, message: string): void {
    const handlers = this.handlers.get(channel);
    if (!handlers?.size) return;
    let envelope: EventEnvelope;
    try {
      envelope = decodeEnvelope(message);
    } catch (error) {
      this.logger?.warn({ channel, error: (error as Error).message }, 'dropping malformed event');
      return;
    }
    for (const handler of handlers) {
      handler(envelope, { attempt: 1 }).catch((error: unknown) => {
        this.logger?.error({ channel, eventId: envelope.id, error: (error as Error).message }, 'event delivery failed');
      });
    }
  }

  async connect(): Promise<void> {
    await ensureConnected(this.pub);
    await ensureConnected(this.sub);
    this.connected = true;
    const channels = [...this.handlers.keys()];
    if (channels.length) await this.sub.subscribe(...channels);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    await closeRedis(this.sub);
    if (this.ownsPub) await closeRedis(this.pub);
  }

  isHealthy(): Promise<boolean> {
    return pingRedis(this.pub);
  }

  async publish(envelope: EventEnvelope): Promise<void> {
    if (!this.connected) throw new EventsError('events/not-connected', 'Event bus is not connected');
    await this.pub.publish(this.channel(envelope.type), encodeEnvelope(envelope));
  }

  subscribe(eventName: string, handler: EnvelopeHandler, _options: BusSubscribeOptions = {}): BusSubscription {
    const channel = this.channel(eventName);
    let set = this.handlers.get(channel);
    const isNew = !set;
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
    }
    set.add(handler);
    const ready = isNew && this.connected ? this.sub.subscribe(channel).then(() => undefined) : Promise.resolve();
    return {
      ready,
      unsubscribe: async () => {
        set.delete(handler);
        if (set.size === 0) {
          this.handlers.delete(channel);
          if (this.connected) await this.sub.unsubscribe(channel);
        }
      },
    };
  }
}
