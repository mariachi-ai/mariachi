import type { MetricsAdapter } from './types';
import { NoopMetricsAdapter } from './adapters/metrics/noop';
import { PrometheusMetricsAdapter } from './adapters/metrics/prometheus';

export function createMetrics(config?: { adapter?: string }): MetricsAdapter {
  switch (config?.adapter) {
    case 'prometheus':
      return new PrometheusMetricsAdapter();
    default:
      return new NoopMetricsAdapter();
  }
}
