import type { Logger } from './context';
import { getContainer, KEYS, type Container } from './container';
import { MariachiError } from './errors';

export interface Span {
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(status: 'ok' | 'error', message?: string): void;
  recordException?(error: Error): void;
  end(): void;
}

export interface TracerAdapter {
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span;
  withSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T>;
}

export interface MetricsAdapter {
  increment(name: string, value?: number, tags?: Record<string, string>): void;
  gauge(name: string, value: number, tags?: Record<string, string>): void;
  histogram(name: string, value: number, tags?: Record<string, string>): void;
  timing(name: string, value: number, tags?: Record<string, string>): void;
}

export interface Instrumentable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
}

/** Observability dependencies every abstract service accepts. */
export interface InstrumentationDeps {
  logger?: Logger;
  tracer?: TracerAdapter;
  metrics?: MetricsAdapter;
}

export interface ResolvedInstrumentation {
  logger: Logger;
  tracer?: TracerAdapter;
  metrics?: MetricsAdapter;
}

/**
 * Explicit deps win; anything missing falls back to the container.
 * A logger is required from one of the two.
 */
export function resolveInstrumentation(
  deps: InstrumentationDeps = {},
  container: Container = getContainer(),
): ResolvedInstrumentation {
  const logger = deps.logger ?? container.tryResolve(KEYS.Logger);
  if (!logger) {
    throw new MariachiError(
      'container/missing-logger',
      'No logger provided. Pass { logger } explicitly or call bootstrap() before constructing services.',
    );
  }
  return {
    logger,
    tracer: deps.tracer ?? container.tryResolve(KEYS.Tracer),
    metrics: deps.metrics ?? container.tryResolve(KEYS.Metrics),
  };
}

export async function withSpan<T>(
  tracer: TracerAdapter | undefined,
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span?: Span) => Promise<T>,
): Promise<T> {
  if (!tracer) return fn(undefined);
  return tracer.withSpan(name, async (span) => {
    for (const [k, v] of Object.entries(attributes)) {
      span.setAttribute(k, v);
    }
    try {
      const result = await fn(span);
      span.setStatus('ok');
      return result;
    } catch (error) {
      span.recordException?.(error as Error);
      span.setStatus('error', (error as Error).message);
      throw error;
    }
  });
}

export function timed<T>(
  metrics: MetricsAdapter | undefined,
  metricName: string,
  tags?: Record<string, string>,
): { end: (success: boolean) => void; wrap: (fn: () => Promise<T>) => Promise<T> } {
  const start = performance.now();
  const end = (success: boolean) => {
    metrics?.timing(metricName, performance.now() - start, tags);
    metrics?.increment(`${metricName}.count`, 1, tags);
    if (!success) metrics?.increment(`${metricName}.error`, 1, tags);
  };
  return {
    end,
    async wrap(fn: () => Promise<T>): Promise<T> {
      try {
        const result = await fn();
        end(true);
        return result;
      } catch (error) {
        end(false);
        throw error;
      }
    },
  };
}
