import type { Context, Logger, TracerAdapter, MetricsAdapter } from '@mariachi/core';
import { withSpan, getContainer, KEYS } from '@mariachi/core';
import type { Instrumentable } from '@mariachi/core';
import type { CommunicationLayer } from './types';

export abstract class Communication implements Instrumentable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly layer: CommunicationLayer;

  constructor(config: { layer: CommunicationLayer }) {
    const container = getContainer();
    this.logger = container.resolve<Logger>(KEYS.Logger);
    this.tracer = container.has(KEYS.Tracer) ? container.resolve<TracerAdapter>(KEYS.Tracer) : undefined;
    this.metrics = container.has(KEYS.Metrics) ? container.resolve<MetricsAdapter>(KEYS.Metrics) : undefined;
    this.layer = config.layer;
  }

  async call<TInput, TOutput>(ctx: Context, name: string, input: TInput): Promise<TOutput> {
    return withSpan(this.tracer, `communication.call.${name}`, { procedure: name }, async () => {
      const start = performance.now();
      try {
        const result = await this.layer.call<TInput, TOutput>(name, ctx, input);
        const durationMs = performance.now() - start;
        this.metrics?.histogram('communication.call.latency', durationMs, { procedure: name });
        this.metrics?.increment('communication.call.count', 1, { procedure: name });
        return result;
      } catch (error) {
        const durationMs = performance.now() - start;
        this.metrics?.histogram('communication.call.latency', durationMs, { procedure: name });
        this.metrics?.increment('communication.call.error', 1, { procedure: name });
        throw error;
      }
    });
  }

  register(name: string, definition: any): void {
    this.layer.register(name, definition);
  }

  use(middleware: any): void {
    this.layer.use(middleware);
  }
}

export class DefaultCommunication extends Communication {}
