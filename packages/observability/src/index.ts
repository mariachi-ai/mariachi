export type {
  Span,
  TracerAdapter,
  MetricsAdapter,
  ErrorTracker,
  ObservabilityConfig,
} from './types';

export { PinoLoggerAdapter, contextBindings, type PinoLoggerOptions } from './adapters/logging/pino';
export { ConsoleLoggerAdapter } from './adapters/logging/console';
export { NoopTracerAdapter } from './adapters/tracing/noop';
export { NoopMetricsAdapter } from './adapters/metrics/noop';
export { NoopErrorTracker } from './adapters/errors/noop';

export {
  OpenTelemetryTracerAdapter,
  setupOpenTelemetry,
  type OpenTelemetrySetupOptions,
} from './adapters/tracing/opentelemetry';
export { PrometheusMetricsAdapter, type MetricDefinition } from './adapters/metrics/prometheus';
export { SentryErrorTracker } from './adapters/errors/sentry';

export { createLogger } from './logger';
export { createTracer } from './tracer';
export { createMetrics } from './metrics';
export { createErrorTracker } from './errors';

import type { Logger } from '@mariachi/core';
import type { TracerAdapter, MetricsAdapter, ErrorTracker, ObservabilityConfig } from './types';
import { createLogger } from './logger';
import { createTracer } from './tracer';
import { createMetrics } from './metrics';
import { createErrorTracker } from './errors';

export interface Observability {
  logger: Logger;
  tracer: TracerAdapter;
  metrics: MetricsAdapter;
  errors: ErrorTracker;
}

export function createObservability(config?: ObservabilityConfig): Observability {
  return {
    logger: createLogger(config?.logging),
    tracer: createTracer({ serviceName: config?.serviceName, ...config?.tracing }),
    metrics: createMetrics(config?.metrics),
    errors: createErrorTracker(config?.errors),
  };
}
