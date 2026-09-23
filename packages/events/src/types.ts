import type Redis from 'ioredis';
import type { Context, Logger, RetryConfig } from '@mariachi/core';
import type { ZodType } from 'zod';

/**
 * Wire format for every event. Context travels here, never inside `payload`, so subscribers get a
 * real `Context` (trace, tenant, user) without the publisher having to remember to add it.
 */
export interface EventEnvelope<T = unknown> {
  /** Unique event id; subscribers use it for dedup. */
  id: string;
  type: string;
  payload: T;
  occurredAt: string;
  traceId: string;
  tenantId: string | null;
  userId: string | null;
  identityType: string;
  /** Logical publisher (service name), if configured. */
  source?: string;
}

export interface DeliveryInfo {
  /** 1-based delivery attempt as seen by the broker (always 1 for at-most-once adapters). */
  attempt: number;
}

/** Low-level adapter handler. Throwing means "not processed"; at-least-once adapters redeliver. */
export type EnvelopeHandler = (envelope: EventEnvelope, delivery: DeliveryInfo) => Promise<void>;

export interface BusSubscribeOptions {
  /**
   * Consumer group. Subscribers in the same group share the work (each event goes to one of them);
   * different groups each get every event. Ignored by fan-out-only adapters (`redis`, `memory` without groups).
   */
  group?: string;
}

export interface BusSubscription {
  /** Resolves once the broker-side subscription exists (events published after this are received). */
  ready: Promise<void>;
  unsubscribe(): Promise<void>;
}

export type DeliveryGuarantee = 'at-most-once' | 'at-least-once';

/**
 * Transport port. Subscriptions registered before `connect()` are activated on connect, and
 * adapters re-establish them after reconnects.
 */
export interface EventBus {
  readonly name: string;
  readonly guarantee: DeliveryGuarantee;
  publish(envelope: EventEnvelope): Promise<void>;
  subscribe(eventName: string, handler: EnvelopeHandler, options?: BusSubscribeOptions): BusSubscription;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isHealthy(): Promise<boolean>;
}

export interface EventMeta {
  id: string;
  type: string;
  occurredAt: Date;
  attempt: number;
  source?: string;
}

/** Application handler: context first, then the (validated) payload. */
export type EventHandler<T = unknown> = (ctx: Context, payload: T, meta: EventMeta) => Promise<void>;

export interface EventDefinition<T = unknown> {
  name: string;
  schema?: ZodType<T>;
  description?: string;
}

export interface SubscribeOptions extends BusSubscribeOptions {
  /** In-process retries before the event is dead-lettered. Default 3 attempts, exponential. */
  retry?: Partial<RetryConfig>;
  /** Error codes that skip retries and go straight to the dead-letter sink. */
  nonRetryableCodes?: string[];
}

export interface DeadLetter {
  envelope: EventEnvelope;
  subscriber: string;
  error: { code?: string; message: string };
  attempts: number;
  failedAt: string;
}

/** Where events go after exhausting retries. */
export interface DeadLetterSink {
  send(entry: DeadLetter): Promise<void>;
}

interface BaseConfig {
  /** Channel/subject/stream prefix. Default `mariachi.events`. */
  prefix?: string;
  /** Receives transport-level problems (malformed messages, broker errors). */
  logger?: Logger;
}

export type EventBusConfig =
  | ({ adapter: 'memory' } & BaseConfig)
  | ({ adapter: 'redis'; url?: string; client?: Redis } & BaseConfig)
  | ({
      adapter: 'redis-streams';
      url?: string;
      client?: Redis;
      /** Default consumer group when a subscription doesn't name one. Default `default`. */
      group?: string;
      /** Approximate max entries kept per stream (XADD MAXLEN ~). Default 100k. */
      maxLen?: number;
      /** Pending messages idle longer than this are reclaimed from dead consumers. Default 30s. */
      claimIdleMs?: number;
      /** Deliveries before a message is moved to the dead-letter stream. Default 10. */
      maxDeliveries?: number;
      blockMs?: number;
      batchSize?: number;
    } & BaseConfig)
  | ({ adapter: 'nats'; url?: string; servers?: string[] } & BaseConfig)
  | ({
      adapter: 'nats-jetstream';
      url?: string;
      servers?: string[];
      stream: string;
      /** Consumer ack wait before redelivery. Default 30s. */
      ackWaitMs?: number;
      maxDeliveries?: number;
    } & BaseConfig);
