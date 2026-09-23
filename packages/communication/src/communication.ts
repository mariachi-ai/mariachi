import type { z } from 'zod';
import type { Context, Logger, TracerAdapter, MetricsAdapter, Middleware, InstrumentationDeps } from '@mariachi/core';
import { withSpan, resolveInstrumentation } from '@mariachi/core';
import type { Instrumentable } from '@mariachi/core';
import type {
  CallOptions,
  CommunicationLayer,
  ProcedureDefinition,
  ProcedureInput,
  ProcedureName,
  ProcedureOutput,
  RegisterOptions,
} from './types';

export interface CommunicationConfig {
  layer: CommunicationLayer;
}

/** Instrumented communication layer: every call gets a span, latency histogram and error counter. */
export abstract class Communication implements Instrumentable, CommunicationLayer {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly layer: CommunicationLayer;

  constructor(config: CommunicationConfig, deps?: InstrumentationDeps) {
    const resolved = resolveInstrumentation(deps);
    this.logger = resolved.logger;
    this.tracer = resolved.tracer;
    this.metrics = resolved.metrics;
    this.layer = config.layer;
  }

  call<N extends ProcedureName>(ctx: Context, name: N, input: ProcedureInput<N>, options?: CallOptions): Promise<ProcedureOutput<N>>;
  call<TOutput = unknown>(ctx: Context, name: string, input: unknown, options?: CallOptions): Promise<TOutput>;
  async call(ctx: Context, name: string, input: unknown, options?: CallOptions): Promise<unknown> {
    return withSpan(this.tracer, `communication.call ${name}`, { 'mariachi.procedure': name, 'mariachi.trace_id': ctx.traceId }, async () => {
      const start = performance.now();
      try {
        const result = await this.layer.call(ctx, name, input, options);
        this.metrics?.histogram('communication.call.latency', performance.now() - start, { procedure: name, outcome: 'ok' });
        this.metrics?.increment('communication.call.count', 1, { procedure: name, outcome: 'ok' });
        return result;
      } catch (error) {
        const code = (error as { code?: string }).code ?? 'unknown';
        this.metrics?.histogram('communication.call.latency', performance.now() - start, { procedure: name, outcome: 'error' });
        this.metrics?.increment('communication.call.count', 1, { procedure: name, outcome: 'error' });
        this.metrics?.increment('communication.call.error', 1, { procedure: name, code });
        throw error;
      }
    });
  }

  register<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny>(
    name: string,
    definition: ProcedureDefinition<TInput, TOutput>,
    options?: RegisterOptions,
  ): void {
    this.layer.register(name, definition, options);
    this.logger.debug({ procedure: name }, 'Registered procedure');
  }

  unregister(name: string): void {
    this.layer.unregister(name);
  }

  use(middleware: Middleware): void {
    this.layer.use(middleware);
  }

  has(name: string): boolean {
    return this.layer.has(name);
  }

  procedures(): string[] {
    return this.layer.procedures();
  }
}

export class DefaultCommunication extends Communication {}
