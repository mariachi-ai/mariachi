import Redis from 'ioredis';
import type { Context } from '@mariachi/core';
import type { EventBus, EventHandler, TypedEvent } from '../types';

export class RedisEventBusAdapter implements EventBus {
  private pub: Redis | null = null;
  private sub: Redis | null = null;
  private readonly url: string;
  private readonly prefix: string;
  private readonly handlers = new Map<string, Set<EventHandler<unknown>>>();
  private subscribedChannels = new Set<string>();

  constructor(url: string, prefix: string) {
    this.url = url;
    this.prefix = prefix;
  }

  async connect(): Promise<void> {
    this.pub = new Redis(this.url);
    this.sub = new Redis(this.url);
    this.sub.on('message', (channel: string, message: string) => {
      const eventName = this.prefix ? channel.slice(this.prefix.length + 1) : channel;
      const handlers = this.handlers.get(eventName);
      if (!handlers?.size) return;
      try {
        const envelope = JSON.parse(message) as TypedEvent<unknown>;
        const payload = envelope.payload;
        void Promise.all(
          Array.from(handlers).map((h) => h(payload, undefined as Context | undefined))
        );
      } catch {
        // ignore parse/handler errors per message
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.sub) {
      await this.sub.quit();
      this.sub = null;
    }
    if (this.pub) {
      await this.pub.quit();
      this.pub = null;
    }
    this.handlers.clear();
    this.subscribedChannels.clear();
  }

  async publish<T>(eventName: string, payload: T): Promise<void> {
    if (!this.pub) throw new Error('EventBus not connected');
    const channel = this.prefix ? `${this.prefix}:${eventName}` : eventName;
    const envelope: TypedEvent<T> = {
      type: eventName,
      payload,
      occurredAt: new Date().toISOString(),
    };
    await this.pub.publish(channel, JSON.stringify(envelope));
  }

  subscribe<T>(eventName: string, handler: EventHandler<T>): void {
    const channel = this.prefix ? `${this.prefix}:${eventName}` : eventName;
    let set = this.handlers.get(eventName) as Set<EventHandler<T>> | undefined;
    if (!set) {
      set = new Set();
      this.handlers.set(eventName, set as Set<EventHandler<unknown>>);
    }
    set.add(handler as EventHandler<T>);
    if (!this.subscribedChannels.has(channel) && this.sub) {
      this.sub.subscribe(channel);
      this.subscribedChannels.add(channel);
    }
  }

  unsubscribe(eventName: string, handler: EventHandler): void {
    const channel = this.prefix ? `${this.prefix}:${eventName}` : eventName;
    const set = this.handlers.get(eventName);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      this.handlers.delete(eventName);
      if (this.subscribedChannels.has(channel) && this.sub) {
        this.sub.unsubscribe(channel);
        this.subscribedChannels.delete(channel);
      }
    }
  }
}
