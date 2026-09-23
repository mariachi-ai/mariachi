export type { Span, TracerAdapter, MetricsAdapter } from '@mariachi/core';

export interface ErrorTracker {
  captureException(error: Error, context?: Record<string, unknown>): void;
  captureMessage(message: string, level: 'info' | 'warning' | 'error'): void;
  flush?(timeoutMs?: number): Promise<boolean>;
}

export interface ObservabilityConfig {
  serviceName?: string;
  logging?: { adapter?: string; level?: string };
  tracing?: { adapter?: string; endpoint?: string; serviceName?: string };
  metrics?: { adapter?: string; prefix?: string };
  errors?: { adapter?: string; dsn?: string; environment?: string; release?: string };
}
