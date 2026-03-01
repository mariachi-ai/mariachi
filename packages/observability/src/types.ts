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

export interface ErrorTracker {
  captureException(error: Error, context?: Record<string, unknown>): void;
  captureMessage(message: string, level: 'info' | 'warning' | 'error'): void;
}

export interface ObservabilityConfig {
  logging?: { adapter?: string; level?: string };
  tracing?: { adapter?: string; endpoint?: string };
  metrics?: { adapter?: string };
  errors?: { adapter?: string; dsn?: string };
}
