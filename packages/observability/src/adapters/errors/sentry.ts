import { loadOptionalPeer, currentContext } from '@mariachi/core';
import type { ErrorTracker } from '../../types';

type SentryModule = typeof import('@sentry/node');

export class SentryErrorTracker implements ErrorTracker {
  private readonly sentry: SentryModule;

  constructor(config: { dsn: string; environment?: string; release?: string }) {
    this.sentry = loadOptionalPeer<SentryModule>('@sentry/node', 'SentryErrorTracker', import.meta.url);
    this.sentry.init({
      dsn: config.dsn,
      environment: config.environment ?? 'production',
      release: config.release,
    });
  }

  captureException(error: Error, context?: Record<string, unknown>): void {
    const ctx = currentContext();
    this.sentry.captureException(error, {
      extra: context,
      tags: ctx ? { traceId: ctx.traceId, tenantId: ctx.tenantId ?? undefined } : undefined,
      user: ctx?.userId ? { id: ctx.userId } : undefined,
    });
  }

  captureMessage(message: string, level: 'info' | 'warning' | 'error'): void {
    this.sentry.captureMessage(message, level);
  }

  flush(timeoutMs = 2000): Promise<boolean> {
    return this.sentry.flush(timeoutMs);
  }
}
