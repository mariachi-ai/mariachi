import type { Logger } from './context';

export interface Span {
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(status: 'ok' | 'error', message?: string): void;
  end(): void;
}

export interface TracerAdapter {
  startSpan(name: string, attributes?: Record<string, string>): Span;
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
  return {
    end(success: boolean) {
      const durationMs = performance.now() - start;
      metrics?.timing(metricName, durationMs, tags);
      metrics?.increment(`${metricName}.count`, 1, tags);
      if (!success) metrics?.increment(`${metricName}.error`, 1, tags);
    },
    async wrap(fn: () => Promise<T>): Promise<T> {
      try {
        const result = await fn();
        const durationMs = performance.now() - start;
        metrics?.timing(metricName, durationMs, tags);
        metrics?.increment(`${metricName}.count`, 1, tags);
        return result;
      } catch (error) {
        const durationMs = performance.now() - start;
        metrics?.timing(metricName, durationMs, tags);
        metrics?.increment(`${metricName}.count`, 1, tags);
        metrics?.increment(`${metricName}.error`, 1, tags);
        throw error;
      }
    },
  };
}
