import { connect, type NatsConnection, StringCodec, type Subscription } from 'nats';
import type { EventBus, EventHandler, TypedEvent } from '../types';

export class NATSEventBusAdapter implements EventBus {
  private connection: NatsConnection | null = null;
  private readonly sc = StringCodec();
  private readonly handlers = new Map<string, Set<EventHandler<unknown>>>();
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly servers: string | string[];
  private readonly prefix: string;

  constructor(servers: string | string[], prefix: string = 'mariachi.events') {
    this.servers = servers;
    this.prefix = prefix;
  }

  async connect(): Promise<void> {
    this.connection = await connect({
      servers: Array.isArray(this.servers) ? this.servers : [this.servers],
    });
  }

  async disconnect(): Promise<void> {
    for (const sub of this.subscriptions.values()) {
      sub.unsubscribe();
    }
    this.subscriptions.clear();
    this.handlers.clear();
    await this.connection?.drain();
    this.connection = null;
  }

  async publish<T>(eventName: string, payload: T): Promise<void> {
    if (!this.connection) throw new Error('NATS EventBus not connected');
    const subject = this.subject(eventName);
    const envelope: TypedEvent<T> = {
      type: eventName,
      payload,
      occurredAt: new Date().toISOString(),
    };
    this.connection.publish(subject, this.sc.encode(JSON.stringify(envelope)));
  }

  subscribe<T>(eventName: string, handler: EventHandler<T>): void {
    if (!this.connection) throw new Error('NATS EventBus not connected');
    const subject = this.subject(eventName);

    let set = this.handlers.get(eventName) as Set<EventHandler<T>> | undefined;
    if (!set) {
      set = new Set();
      this.handlers.set(eventName, set as Set<EventHandler<unknown>>);
    }
    set.add(handler as EventHandler<T>);

    if (!this.subscriptions.has(subject)) {
      const sub = this.connection.subscribe(subject);
      this.subscriptions.set(subject, sub);
      (async () => {
        for await (const msg of sub) {
          try {
            const envelope = JSON.parse(this.sc.decode(msg.data)) as TypedEvent<unknown>;
            const handlers = this.handlers.get(eventName);
            if (handlers) {
              await Promise.all(Array.from(handlers).map((h) => h(envelope.payload)));
            }
          } catch {
            // skip malformed messages
          }
        }
      })();
    }
  }

  unsubscribe(eventName: string, handler: EventHandler): void {
    const subject = this.subject(eventName);
    const set = this.handlers.get(eventName);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      this.handlers.delete(eventName);
      const sub = this.subscriptions.get(subject);
      if (sub) {
        sub.unsubscribe();
        this.subscriptions.delete(subject);
      }
    }
  }

  private subject(eventName: string): string {
    return `${this.prefix}.${eventName}`;
  }
}
