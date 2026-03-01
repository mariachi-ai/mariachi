import type { MetricsAdapter } from '../../types';

export class NoopMetricsAdapter implements MetricsAdapter {
  increment() {}
  gauge() {}
  histogram() {}
  timing() {}
}
