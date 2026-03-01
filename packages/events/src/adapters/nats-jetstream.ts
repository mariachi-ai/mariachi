import {
  connect,
  type NatsConnection,
  type JetStreamClient,
  type JetStreamManager,
  type ConsumerMessages,
  StringCodec,
  AckPolicy,
} from 'nats';
import type { EventBus, EventHandler, TypedEvent } from '../types';

export interface JetStreamConfig {
  servers: string | string[];
  stream: string;
  prefix?: string;
  durableName?: string;
}

export class NATSJetStreamAdapter implements EventBus {
  private connection: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private jsm: JetStreamManager | null = null;
  private readonly sc = StringCodec();
  private readonly handlers = new Map<string, Set<EventHandler<unknown>>>();
  private readonly consumers = new Map<string, ConsumerMessages>();
  private readonly config: JetStreamConfig;

  constructor(config: JetStreamConfig) {
    this.config = {
      prefix: 'mariachi.events',
      ...config,
    };
  }

  async connect(): Promise<void> {
    const servers = Array.isArray(this.config.servers) ? this.config.servers : [this.config.servers];
    this.connection = await connect({ servers });
    this.jsm = await this.connection.jetstreamManager();
    this.js = this.connection.jetstream();

    try {
      await this.jsm.streams.info(this.config.stream);
    } catch {
      await this.jsm.streams.add({
        name: this.config.stream,
        subjects: [`${this.config.prefix}.>`],
      });
    }
  }

  async disconnect(): Promise<void> {
    for (const consumer of this.consumers.values()) {
      await consumer.close();
    }
    this.consumers.clear();
    this.handlers.clear();
    await this.connection?.drain();
    this.connection = null;
    this.js = null;
    this.jsm = null;
  }

  async publish<T>(eventName: string, payload: T): Promise<void> {
    if (!this.js) throw new Error('JetStream not connected');
    const subject = this.subject(eventName);
    const envelope: TypedEvent<T> = {
      type: eventName,
      payload,
      occurredAt: new Date().toISOString(),
    };
    await this.js.publish(subject, this.sc.encode(JSON.stringify(envelope)));
  }

  subscribe<T>(eventName: string, handler: EventHandler<T>): void {
    if (!this.js || !this.jsm || !this.connection) throw new Error('JetStream not connected');
    const subject = this.subject(eventName);

    let set = this.handlers.get(eventName) as Set<EventHandler<T>> | undefined;
    if (!set) {
      set = new Set();
      this.handlers.set(eventName, set as Set<EventHandler<unknown>>);
    }
    set.add(handler as EventHandler<T>);

    if (!this.consumers.has(subject)) {
      const durableName = this.config.durableName
        ? `${this.config.durableName}-${eventName.replace(/\./g, '-')}`
        : undefined;

      const jsm = this.jsm;
      const js = this.js;
      const sc = this.sc;
      const handlers = this.handlers;
      const consumers = this.consumers;

      (async () => {
        await jsm.consumers.add(this.config.stream, {
          durable_name: durableName,
          ack_policy: AckPolicy.Explicit,
          filter_subject: subject,
        });

        const consumer = await js.consumers.get(this.config.stream, durableName);
        const messages = await consumer.consume();
        consumers.set(subject, messages);

        for await (const msg of messages) {
          try {
            const envelope = JSON.parse(sc.decode(msg.data)) as TypedEvent<unknown>;
            const eventHandlers = handlers.get(eventName);
            if (eventHandlers) {
              await Promise.all(Array.from(eventHandlers).map((h) => h(envelope.payload)));
            }
            msg.ack();
          } catch {
            msg.nak();
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
      const consumer = this.consumers.get(subject);
      if (consumer) {
        void consumer.close();
        this.consumers.delete(subject);
      }
    }
  }

  private subject(eventName: string): string {
    return `${this.config.prefix}.${eventName}`;
  }
}
