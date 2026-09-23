import { ConfigError } from '@mariachi/core';
import type { MetricsAdapter } from './types';
import { NoopMetricsAdapter } from './adapters/metrics/noop';
import { PrometheusMetricsAdapter } from './adapters/metrics/prometheus';

export function createMetrics(config?: { adapter?: string; prefix?: string }): MetricsAdapter {
  switch (config?.adapter) {
    case 'prometheus':
      return new PrometheusMetricsAdapter({ prefix: config.prefix, collectDefaultMetrics: true });
    case undefined:
    case 'noop':
      return new NoopMetricsAdapter();
    default:
      throw new ConfigError('observability/unknown-adapter', `Unknown metrics adapter: ${config?.adapter}`);
  }
}
