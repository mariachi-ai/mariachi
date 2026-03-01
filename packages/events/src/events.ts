import type { Context, Logger, Instrumentable } from '@mariachi/core';
import { withSpan, getContainer, KEYS, EventsError } from '@mariachi/core';
import type { TracerAdapter, MetricsAdapter } from '@mariachi/core';
import type { EventBus, EventHandler } from './types';

export abstract class Events implements Instrumentable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly bus: EventBus;

  constructor(config: { bus: EventBus }) {
    const container = getContainer();
    this.logger = container.resolve<Logger>(KEYS.Logger);
    this.tracer = container.has(KEYS.Tracer) ? container.resolve<TracerAdapter>(KEYS.Tracer) : undefined;
    this.metrics = container.has(KEYS.Metrics) ? container.resolve<MetricsAdapter>(KEYS.Metrics) : undefined;
    this.bus = config.bus;
  }

  async publish<T>(ctx: Context, eventName: string, payload: T): Promise<void> {
    return withSpan(this.tracer, 'events.publish', { event: eventName, traceId: ctx.traceId }, async () => {
      this.logger.info({ traceId: ctx.traceId, event: eventName }, 'Publishing event');
      await this.bus.publish(eventName, payload);
      this.metrics?.increment('events.published', 1, { event: eventName });
      await this.onEventPublished?.(ctx, eventName, payload);
    });
  }

  subscribe<T>(eventName: string, handler: EventHandler<T>): void {
    this.bus.subscribe(eventName, handler);
    this.metrics?.increment('events.subscriptions', 1, { event: eventName });
  }

  async connect(): Promise<void> { await this.bus.connect(); }
  async disconnect(): Promise<void> { await this.bus.disconnect(); }

  async publishWithTrace<T extends Record<string, unknown>>(ctx: Context, eventName: string, payload: T): Promise<void> {
    return this.publish(ctx, eventName, { ...payload, _traceId: ctx.traceId, _publishedAt: new Date().toISOString() });
  }

  protected onEventPublished?(ctx: Context, eventName: string, payload: unknown): Promise<void>;
}

export class DefaultEvents extends Events {}
