import { ConfigError } from '@mariachi/core';
import type { ErrorTracker } from './types';
import { NoopErrorTracker } from './adapters/errors/noop';
import { SentryErrorTracker } from './adapters/errors/sentry';

export function createErrorTracker(config?: { adapter?: string; dsn?: string; environment?: string; release?: string }): ErrorTracker {
  switch (config?.adapter) {
    case 'sentry':
      if (!config.dsn) throw new ConfigError('observability/missing-dsn', 'Sentry adapter requires a DSN');
      return new SentryErrorTracker({ dsn: config.dsn, environment: config.environment, release: config.release });
    case undefined:
    case 'noop':
      return new NoopErrorTracker();
    default:
      throw new ConfigError('observability/unknown-adapter', `Unknown error tracker adapter: ${config?.adapter}`);
  }
}
