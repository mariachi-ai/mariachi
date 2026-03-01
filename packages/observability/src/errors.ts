import type { ErrorTracker } from './types';
import { NoopErrorTracker } from './adapters/errors/noop';
import { SentryErrorTracker } from './adapters/errors/sentry';

export function createErrorTracker(config?: { adapter?: string; dsn?: string; environment?: string; release?: string }): ErrorTracker {
  switch (config?.adapter) {
    case 'sentry':
      if (!config.dsn) throw new Error('Sentry adapter requires a DSN');
      return new SentryErrorTracker({ dsn: config.dsn, environment: config.environment, release: config.release });
    default:
      return new NoopErrorTracker();
  }
}
