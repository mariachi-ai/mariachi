import {
  AckPolicy,
  DeliverPolicy,
  StringCodec,
  connect,
  nanos,
  type ConsumerMessages,
  type JetStreamClient,
  type JetStreamManager,
  type NatsConnection,
} from 'nats';
import { EventsError, type Logger } from '@mariachi/core';
import { decodeEnvelope, encodeEnvelope } from '../envelope';
import type { BusSubscribeOptions, BusSubscription, EnvelopeHandler, EventBus, EventEnvelope } from '../types';

export interface JetStreamConfig {
  servers: string[];
  stream: string;
  prefix?: string;
  logger?: Logger;
  ackWaitMs?: number;
  maxDeliveries?: number;
}

interface Registration {
  eventName: string;
  subject: string;
  handler: EnvelopeHandler;
  group?: string;
  messages?: ConsumerMessages;
  consumerName?: string;
  ready: Promise<void>;
}

/**
 * NATS JetStream: at-least-once and persistent. A `group` becomes a durable consumer shared by
 * every instance in that group. Without a group, each subscriber gets an ephemeral consumer that
 * only sees new events and is cleaned up by the server once idle.
 */
export class NATSJetStreamAdapter implements EventBus {
  readonly name = 'nats-jetstream';
  readonly guarantee = 'at-least-once' as const;
  private connection: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private jsm: JetStreamManager | null = null;
  private readonly sc = StringCodec();
  private readonly registrations = new Set<Registration>();
  private readonly prefix: string;
  private readonly logger?: Logger;

  constructor(private readonly config: JetStreamConfig) {
    this.prefix = config.prefix ?? 'mariachi.events';
    this.logger = config.logger;
  }

  private subject(eventName: string): string {
    return `${this.prefix}.${eventName}`;
  }

  async connect(): Promise<void> {
    if (this.connection) return;
    this.connection = await connect({ servers: this.config.servers });
    this.jsm = await this.connection.jetstreamManager();
    this.js = this.connection.jetstream();
    try {
      await this.jsm.streams.info(this.config.stream);
    } catch {
      await this.jsm.streams.add({ name: this.config.stream, subjects: [`${this.prefix}.>`] });
    }
    for (const r of this.registrations) r.ready = this.activate(r);
    await Promise.all([...this.registrations].map((r) => r.ready));
  }

  async disconnect(): Promise<void> {
    for (const r of this.registrations) {
      await r.messages?.close();
      r.messages = undefined;
    }
    const conn = this.connection;
    this.connection = null;
    this.js = null;
    this.jsm = null;
    await conn?.drain();
  }

  async isHealthy(): Promise<boolean> {
    if (!this.connection || this.connection.isClosed() || !this.jsm) return false;
    try {
      await this.jsm.streams.info(this.config.stream);
      return true;
    } catch {
      return false;
    }
  }

  async publish(envelope: EventEnvelope): Promise<void> {
    if (!this.js) throw new EventsError('events/not-connected', 'Event bus is not connected');
    // msgID lets JetStream drop duplicate publishes within its dedup window.
    await this.js.publish(this.subject(envelope.type), this.sc.encode(encodeEnvelope(envelope)), { msgID: envelope.id });
  }

  subscribe(eventName: string, handler: EnvelopeHandler, options: BusSubscribeOptions = {}): BusSubscription {
    const reg: Registration = { eventName, subject: this.subject(eventName), handler, group: options.group, ready: Promise.resolve() };
    this.registrations.add(reg);
    if (this.connection) reg.ready = this.activate(reg);
    return {
      get ready() {
        return reg.ready;
      },
      unsubscribe: async () => {
        this.registrations.delete(reg);
        await reg.messages?.close();
        if (!reg.group && reg.consumerName && this.jsm) {
          await this.jsm.consumers.delete(this.config.stream, reg.consumerName).catch(() => undefined);
        }
      },
    };
  }

  private async activate(reg: Registration): Promise<void> {
    const jsm = this.jsm!;
    const js = this.js!;
    const base = {
      ack_policy: AckPolicy.Explicit,
      filter_subject: reg.subject,
      ack_wait: nanos(this.config.ackWaitMs ?? 30_000),
      max_deliver: this.config.maxDeliveries ?? 10,
      deliver_policy: DeliverPolicy.New,
    };
    const info = reg.group
      ? await jsm.consumers.add(this.config.stream, { ...base, durable_name: sanitize(`${reg.group}-${reg.eventName}`) })
      : await jsm.consumers.add(this.config.stream, { ...base, inactive_threshold: nanos(5 * 60_000) });
    reg.consumerName = info.name;
    const consumer = await js.consumers.get(this.config.stream, info.name);
    const messages = await consumer.consume();
    reg.messages = messages;
    void (async () => {
      for await (const msg of messages) {
        let envelope: EventEnvelope;
        try {
          envelope = decodeEnvelope(this.sc.decode(msg.data));
        } catch (error) {
          this.logger?.warn({ subject: reg.subject, error: (error as Error).message }, 'terminating malformed event');
          msg.term();
          continue;
        }
        const attempt = msg.info.redeliveryCount;
        try {
          await reg.handler(envelope, { attempt });
          msg.ack();
        } catch (error) {
          this.logger?.error({ subject: reg.subject, eventId: envelope.id, attempt, error: (error as Error).message }, 'event delivery failed');
          msg.nak(Math.min(60_000, 1_000 * 2 ** (attempt - 1)));
        }
      }
    })();
  }
}

function sanitize(name: string): string {
  return name.replace(/[.*>\s]/g, '-');
}
