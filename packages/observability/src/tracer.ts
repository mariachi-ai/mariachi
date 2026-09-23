import { ConfigError } from '@mariachi/core';
import type { TracerAdapter } from './types';
import { NoopTracerAdapter } from './adapters/tracing/noop';
import { OpenTelemetryTracerAdapter } from './adapters/tracing/opentelemetry';

export function createTracer(config?: { adapter?: string; endpoint?: string; serviceName?: string }): TracerAdapter {
  switch (config?.adapter) {
    case 'opentelemetry':
    case 'otel':
      return new OpenTelemetryTracerAdapter(config.serviceName);
    case undefined:
    case 'noop':
      return new NoopTracerAdapter();
    default:
      throw new ConfigError('observability/unknown-adapter', `Unknown tracer adapter: ${config?.adapter}`);
  }
}
