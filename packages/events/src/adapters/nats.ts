import { connect, StringCodec, type NatsConnection, type Subscription } from 'nats';
import { EventsError, type Logger } from '@mariachi/core';
import { decodeEnvelope, encodeEnvelope } from '../envelope';
import type { BusSubscribeOptions, BusSubscription, EnvelopeHandler, EventBus, EventEnvelope } from '../types';

export interface NatsEventBusOptions {
  servers: string[];
  prefix?: string;
  logger?: Logger;
}

interface Registration {
  subject: string;
  handler: EnvelopeHandler;
  group?: string;
  sub?: Subscription;
}

/**
 * Core NATS: at-most-once. Subscribers with the same `group` form a queue group and share events.
 * The client reconnects and restores subscriptions on its own; registrations made before
 * `connect()` are activated on connect.
 */
export class NATSEventBusAdapter implements EventBus {
  readonly name = 'nats';
  readonly guarantee = 'at-most-once' as const;
  private connection: NatsConnection | null = null;
  private readonly sc = StringCodec();
  private readonly registrations = new Set<Registration>();
  private readonly prefix: string;
  private readonly logger?: Logger;

  constructor(private readonly options: NatsEventBusOptions) {
    this.prefix = options.prefix ?? 'mariachi.events';
    this.logger = options.logger;
  }

  private subject(eventName: string): string {
    return `${this.prefix}.${eventName}`;
  }

  async connect(): Promise<void> {
    if (this.connection) return;
    this.connection = await connect({ servers: this.options.servers });
    for (const r of this.registrations) this.activate(r);
  }

  async disconnect(): Promise<void> {
    const conn = this.connection;
    this.connection = null;
    for (const r of this.registrations) r.sub = undefined;
    await conn?.drain();
  }

  async isHealthy(): Promise<boolean> {
    if (!this.connection || this.connection.isClosed()) return false;
    try {
      await this.connection.flush();
      return true;
    } catch {
      return false;
    }
  }

  async publish(envelope: EventEnvelope): Promise<void> {
    if (!this.connection) throw new EventsError('events/not-connected', 'Event bus is not connected');
    this.connection.publish(this.subject(envelope.type), this.sc.encode(encodeEnvelope(envelope)));
  }

  subscribe(eventName: string, handler: EnvelopeHandler, options: BusSubscribeOptions = {}): BusSubscription {
    const reg: Registration = { subject: this.subject(eventName), handler, group: options.group };
    this.registrations.add(reg);
    if (this.connection) this.activate(reg);
    return {
      ready: this.connection ? this.connection.flush() : Promise.resolve(),
      unsubscribe: async () => {
        this.registrations.delete(reg);
        reg.sub?.unsubscribe();
      },
    };
  }

  private activate(reg: Registration): void {
    const sub = this.connection!.subscribe(reg.subject, reg.group ? { queue: reg.group } : undefined);
    reg.sub = sub;
    void (async () => {
      for await (const msg of sub) {
        let envelope: EventEnvelope;
        try {
          envelope = decodeEnvelope(this.sc.decode(msg.data));
        } catch (error) {
          this.logger?.warn({ subject: reg.subject, error: (error as Error).message }, 'dropping malformed event');
          continue;
        }
        await reg.handler(envelope, { attempt: 1 }).catch((error: unknown) => {
          this.logger?.error({ subject: reg.subject, eventId: envelope.id, error: (error as Error).message }, 'event delivery failed');
        });
      }
    })();
  }
}
