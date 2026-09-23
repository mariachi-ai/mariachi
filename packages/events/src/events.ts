import type { Context, Disposable, Instrumentable, Logger, MetricsAdapter, RetryConfig, TracerAdapter } from '@mariachi/core';
import { fromZodError, resolveInstrumentation, retry, runWithContext, withSpan, type InstrumentationDeps } from '@mariachi/core';
import { contextFromEnvelope, createEnvelope } from './envelope';
import { LoggingDeadLetterSink } from './dead-letter';
import type {
  BusSubscription,
  DeadLetterSink,
  EnvelopeHandler,
  EventBus,
  EventDefinition,
  EventEnvelope,
  EventHandler,
  EventMeta,
  SubscribeOptions,
} from './types';

export interface EventsConfig {
  bus: EventBus;
  /** Receives events whose handlers exhausted retries. Default: log at error level. */
  deadLetter?: DeadLetterSink;
  /** Stamped on every published envelope as `source`. */
  source?: string;
  /** Default in-process retry policy for subscribers. */
  retry?: Partial<RetryConfig>;
}

export interface PublishOptions {
  /** Explicit event id (e.g. from an outbox row) for downstream dedup. */
  id?: string;
  occurredAt?: Date;
}

const DEFAULT_RETRY: Partial<RetryConfig> = { attempts: 3, backoff: 'exponential', baseDelayMs: 100, maxDelayMs: 5_000, jitter: true };

type EventRef<T> = string | EventDefinition<T>;

function refName(ref: EventRef<unknown>): string {
  return typeof ref === 'string' ? ref : ref.name;
}

/**
 * Domain event service. Publishing stamps the caller's context onto the envelope; subscribers get a
 * rebuilt `Context`, schema-validated payloads, in-process retries, and dead-lettering. Handler
 * errors are never swallowed: they are logged, counted, and sent to the dead-letter sink.
 */
export abstract class Events implements Instrumentable, Disposable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly bus: EventBus;
  protected readonly deadLetter: DeadLetterSink;
  private readonly source?: string;
  private readonly retryDefaults: Partial<RetryConfig>;

  constructor(config: EventsConfig, instrumentation?: InstrumentationDeps) {
    const resolved = resolveInstrumentation(instrumentation);
    this.logger = resolved.logger;
    this.tracer = resolved.tracer;
    this.metrics = resolved.metrics;
    this.bus = config.bus;
    this.deadLetter = config.deadLetter ?? new LoggingDeadLetterSink(this.logger);
    this.source = config.source;
    this.retryDefaults = { ...DEFAULT_RETRY, ...config.retry };
  }

  get guarantee() {
    return this.bus.guarantee;
  }

  async publish<T>(ctx: Context, event: EventRef<T>, payload: T, options: PublishOptions = {}): Promise<EventEnvelope<T>> {
    const name = refName(event);
    const data = this.validateOutgoing(event, payload);
    const envelope = createEnvelope(ctx, name, data, { ...options, source: this.source });
    return withSpan(this.tracer, 'events.publish', { event: name, traceId: ctx.traceId }, async () => {
      await this.bus.publish(envelope);
      ctx.logger.debug({ event: name, eventId: envelope.id }, 'event published');
      this.metrics?.increment('events.published', 1, { event: name });
      await this.onEventPublished?.(ctx, envelope);
      return envelope;
    });
  }

  /** Publishes a pre-built envelope unchanged (used by the outbox relay). */
  async publishEnvelope(envelope: EventEnvelope): Promise<void> {
    await this.bus.publish(envelope);
    this.metrics?.increment('events.published', 1, { event: envelope.type });
  }

  subscribe<T>(event: EventRef<T>, handler: EventHandler<T>, options: SubscribeOptions & { name?: string } = {}): BusSubscription {
    const name = refName(event);
    const schema = typeof event === 'string' ? undefined : event.schema;
    const subscriber = `${options.group ?? 'fanout'}:${name}:${options.name ?? (handler.name || 'handler')}`;
    const retryConfig = { ...this.retryDefaults, ...options.retry };
    const nonRetryable = new Set(['validation/invalid-input', ...(options.nonRetryableCodes ?? [])]);

    const wrapped: EnvelopeHandler = async (envelope, delivery) => {
      const ctx = contextFromEnvelope(envelope, this.logger);
      const meta: EventMeta = {
        id: envelope.id,
        type: envelope.type,
        occurredAt: new Date(envelope.occurredAt),
        attempt: delivery.attempt,
        source: envelope.source,
      };
      let attempts = 0;
      try {
        const payload = schema ? this.parseIncoming(schema, envelope.payload) : (envelope.payload as T);
        await retry(
          async () => {
            attempts++;
            await runWithContext(ctx, () =>
              withSpan(this.tracer, 'events.handle', { event: name, subscriber, traceId: ctx.traceId }, () => handler(ctx, payload, meta)),
            );
          },
          {
            ...retryConfig,
            retryOn: (error) => !nonRetryable.has((error as { code?: string }).code ?? ''),
            onRetry: (error, attempt, delayMs) =>
              ctx.logger.warn({ subscriber, attempt: attempt + 1, delayMs, error: error.message }, 'event handler failed; retrying'),
          },
        );
        this.metrics?.increment('events.handled', 1, { event: name });
      } catch (error) {
        const err = error as { code?: string; message?: string };
        ctx.logger.error({ subscriber, attempts, code: err.code, error: err.message }, 'event handler failed');
        this.metrics?.increment('events.failed', 1, { event: name });
        await this.onHandlerError?.(ctx, envelope, error);
        // If the sink itself fails, rethrow so at-least-once transports redeliver.
        await this.deadLetter.send({
          envelope,
          subscriber,
          attempts: Math.max(1, attempts),
          error: { code: err.code, message: err.message ?? String(error) },
          failedAt: new Date().toISOString(),
        });
      }
    };

    const subscription = this.bus.subscribe(name, wrapped, { group: options.group });
    this.metrics?.increment('events.subscriptions', 1, { event: name });
    return subscription;
  }

  async connect(): Promise<void> {
    await this.bus.connect();
  }

  async disconnect(): Promise<void> {
    await this.bus.disconnect();
  }

  isHealthy(): Promise<boolean> {
    return this.bus.isHealthy();
  }

  private validateOutgoing<T>(event: EventRef<T>, payload: T): T {
    if (typeof event === 'string' || !event.schema) return payload;
    const parsed = event.schema.safeParse(payload);
    if (!parsed.success) throw fromZodError(parsed.error, `Invalid payload for event ${event.name}`);
    return parsed.data;
  }

  private parseIncoming<T>(schema: NonNullable<EventDefinition<T>['schema']>, payload: unknown): T {
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw fromZodError(parsed.error, 'Invalid event payload');
    return parsed.data;
  }

  protected onEventPublished?(ctx: Context, envelope: EventEnvelope): Promise<void>;
  protected onHandlerError?(ctx: Context, envelope: EventEnvelope, error: unknown): Promise<void>;
}

export class DefaultEvents extends Events {}
