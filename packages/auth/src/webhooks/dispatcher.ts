import type { Context, Logger, MetricsAdapter } from '@mariachi/core';
import { createContext } from '@mariachi/core';
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
}

/**
 * Creates a webhook dispatcher that verifies incoming provider webhooks and
 * dispatches normalized events to communication procedures.
 *
 * Each event type maps to a procedure like `{prefix}.{type}` (e.g. `auth.user.created`).
 * The application registers handlers for the event types it cares about.
 *
 * @example
 * ```ts
 * const dispatcher = createAuthWebhookDispatcher({
 *   handler: clerkProvider.createWebhookHandler({ secret: WEBHOOK_SECRET }),
 *   communication,
 *   logger,
 * });
 *
 * app.post('/webhooks/auth', async (req, res) => {
 *   await dispatcher.handle(req.rawBody, req.headers);
 *   res.json({ ok: true });
 * });
 * ```
 */
export function createAuthWebhookDispatcher(config: AuthWebhookDispatcherConfig) {
  const { handler, communication, logger, metrics, onEvent } = config;
  const prefix = config.procedurePrefix ?? 'auth';
  const processedIds = new Set<string>();

  return {
    async handle(
      rawBody: string | Buffer,
      headers: Record<string, string | string[] | undefined>,
    ): Promise<AuthWebhookDispatchResult> {
      const event = handler.verify(rawBody, headers);
      const procedure = `${prefix}.${event.type}`;

      if (processedIds.has(event.id)) {
        logger.info({ eventId: event.id, type: event.type, provider: event.provider }, 'Duplicate webhook event, skipping');
        metrics?.increment('auth.webhook.deduplicated', 1, { provider: event.provider });
        return { event, procedure, dispatched: false };
      }
      processedIds.add(event.id);

      logger.info({ eventId: event.id, type: event.type, provider: event.provider, procedure }, 'Processing auth webhook event');
      metrics?.increment('auth.webhook.received', 1, { provider: event.provider, type: event.type });

      const ctx: Context = createContext({
        logger: logger.child({ provider: event.provider, webhookEvent: event.type, eventId: event.id }),
        userId: null,
        tenantId: null,
        scopes: [],
        identityType: 'webhook',
      });

      if (onEvent) {
        await onEvent(event, ctx);
      }

      let dispatched = false;
      if (communication.has(procedure)) {
        try {
          await communication.call(procedure, ctx, event.data);
          dispatched = true;
          metrics?.increment('auth.webhook.processed', 1, { provider: event.provider, type: event.type });
          logger.info({ eventId: event.id, type: event.type }, 'Auth webhook event dispatched');
        } catch (err) {
          metrics?.increment('auth.webhook.process_failed', 1, { provider: event.provider, type: event.type });
          logger.error(
            { eventId: event.id, type: event.type, error: (err as Error).message },
            'Auth webhook processor failed',
          );
          throw err;
        }
      } else {
        logger.info({ type: event.type, procedure }, 'No handler registered for auth event type');
        metrics?.increment('auth.webhook.unhandled', 1, { provider: event.provider, type: event.type });
      }

      return { event, procedure, dispatched };
    },
  };
}
