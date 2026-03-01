import * as Sentry from '@sentry/node';
import type { ErrorTracker } from '../../types';

export class SentryErrorTracker implements ErrorTracker {
  constructor(config: { dsn: string; environment?: string; release?: string }) {
    Sentry.init({
      dsn: config.dsn,
      environment: config.environment ?? 'production',
      release: config.release,
    });
  }

  captureException(error: Error, context?: Record<string, unknown>): void {
    Sentry.captureException(error, {
      extra: context,
    });
  }

  captureMessage(message: string, level: 'info' | 'warning' | 'error'): void {
    Sentry.captureMessage(message, level);
  }
}
