import type { Context, IdempotencyStore, Logger, MetricsAdapter } from '@mariachi/core';
import { createContext, runOnce } from '@mariachi/core';
import type { CommunicationLayer } from '@mariachi/communication';
import type { AuthWebhookHandler, AuthWebhookEvent } from './types';

export interface AuthWebhookDispatcherConfig {
  /** The provider-specific webhook handler that verifies and normalizes events */
  handler: AuthWebhookHandler;
  /** Communication layer for dispatching events as procedure calls */
  communication: CommunicationLayer;
  logger: Logger;
  metrics?: MetricsAdapter;
  /**
   * Cross-instance dedup (e.g. `RedisIdempotencyStore` from @mariachi/cache). Without it every
   * delivery is processed, so handlers must be idempotent.
   */
  idempotency?: IdempotencyStore;
  /**
   * Prefix for communication procedure names.
   * Events are dispatched as `{prefix}.{eventType}`, e.g. `auth.user.created`.
   * @default 'auth'
   */
  procedurePrefix?: string;
  /**
   * Called for every verified event, regardless of whether a procedure handler is registered.
   * Useful for logging, analytics, or catch-all processing.
   */
  onEvent?: (event: AuthWebhookEvent, ctx: Context) => Promise<void>;
}

export interface AuthWebhookDispatchResult {
  event: AuthWebhookEvent;
  procedure: string;
  dispatched: boolean;
  duplicate?: boolean;
}

/**
 * Verifies incoming provider webhooks and dispatches normalized events to communication
 * procedures named `{prefix}.{type}` (e.g. `auth.user.created`).
 *
 * @example
 * ```ts
 * const dispatcher = createAuthWebhookDispatcher({
 *   handler: clerkProvider.createWebhookHandler({ secret: WEBHOOK_SECRET }),
 *   communication,
 *   idempotency: new RedisIdempotencyStore(redis),
 *   logger,
 * });
 * await dispatcher.handle(req.rawBody, req.headers);
 * ```
 */
export function createAuthWebhookDispatcher(config: AuthWebhookDispatcherConfig) {
  const { handler, communication, logger, metrics, onEvent, idempotency } = config;
  const prefix = config.procedurePrefix ?? 'auth';

  if (!idempotency) {
    logger.warn({}, 'Auth webhook dispatcher has no idempotency store; duplicate deliveries will be reprocessed');
  }

  async function process(event: AuthWebhookEvent, procedure: string): Promise<boolean> {
    logger.info({ eventId: event.id, type: event.type, provider: event.provider, procedure }, 'Processing auth webhook event');
    metrics?.increment('auth.webhook.received', 1, { provider: event.provider, type: event.type });

    const ctx: Context = createContext({
      logger: logger.child({ provider: event.provider, webhookEvent: event.type, eventId: event.id }),
      userId: null,
      tenantId: event.tenantId ?? null,
      scopes: [],
      identityType: 'webhook',
    });

    if (onEvent) await onEvent(event, ctx);

    if (!communication.has(procedure)) {
      logger.info({ type: event.type, procedure }, 'No handler registered for auth event type');
      metrics?.increment('auth.webhook.unhandled', 1, { provider: event.provider, type: event.type });
      return false;
    }

    try {
      await communication.call(ctx, procedure, event.data);
      metrics?.increment('auth.webhook.processed', 1, { provider: event.provider, type: event.type });
      return true;
    } catch (err) {
      metrics?.increment('auth.webhook.process_failed', 1, { provider: event.provider, type: event.type });
      logger.error({ eventId: event.id, type: event.type, err }, 'Auth webhook processor failed');
      throw err;
    }
  }

  return {
    async handle(
      rawBody: string | Buffer,
      headers: Record<string, string | string[] | undefined>,
    ): Promise<AuthWebhookDispatchResult> {
      const event = await handler.verify(rawBody, headers);
      const procedure = `${prefix}.${event.type}`;

      if (!idempotency) {
        return { event, procedure, dispatched: await process(event, procedure) };
      }

      const outcome = await runOnce(idempotency, `auth-webhook:${event.provider}:${event.id}`, () => process(event, procedure));
      if (outcome.status !== 'processed') {
        logger.info({ eventId: event.id, type: event.type, status: outcome.status }, 'Duplicate webhook event, skipping');
        metrics?.increment('auth.webhook.deduplicated', 1, { provider: event.provider });
        return { event, procedure, dispatched: false, duplicate: true };
      }
      return { event, procedure, dispatched: outcome.result };
    },
  };
}
