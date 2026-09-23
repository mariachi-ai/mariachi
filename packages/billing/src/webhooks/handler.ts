import {
  BillingError,
  InMemoryIdempotencyStore,
  createContext,
  resolveInstrumentation,
  runOnce,
  withSpan,
  type Context,
  type IdempotencyStore,
  type InstrumentationDeps,
} from '@mariachi/core';
import type { BillingAdapter, BillingEvent, BillingEventHandler, BillingEventType, BillingStore, ProviderEvent } from '../types';
import { normalizeAndSync } from './normalize';

export interface BillingWebhookHandlerConfig {
  adapter: BillingAdapter;
  secret: string;
  /** Local mirror updated before handlers run. Strongly recommended in production. */
  store?: BillingStore;
  /**
   * Cross-instance dedup. Defaults to in-process memory, which is only safe for a
   * single instance — use `RedisIdempotencyStore` from `@mariachi/cache` in production.
   */
  idempotency?: IdempotencyStore;
  /** Called for every normalized event. Throwing makes the provider retry. */
  onEvent?: BillingEventHandler;
  /** Typed per-event handlers. */
  on?: { [K in BillingEventType]?: (ctx: Context, event: Extract<BillingEvent, { type: K }>) => Promise<void> };
  /** Reject test-mode events in production. */
  requireLivemode?: boolean;
}

export type WebhookOutcome = 'processed' | 'duplicate' | 'in-progress' | 'ignored';

export interface BillingWebhookResult {
  eventId: string;
  type: string;
  outcome: WebhookOutcome;
  events: BillingEvent['type'][];
}

/**
 * Verifies, deduplicates and processes provider webhooks.
 *
 * Ordering guarantees:
 *   1. Signature verified before anything else.
 *   2. The event id is claimed, and only marked complete after the store sync and
 *      every handler succeed. Failures release the claim so the provider's retry is
 *      processed rather than dropped as a duplicate.
 *   3. Store upserts are versioned by the provider's event time, so late
 *      deliveries never overwrite newer state.
 */
export function createBillingWebhookHandler(config: BillingWebhookHandlerConfig, instrumentation?: InstrumentationDeps) {
  const { logger, tracer, metrics } = resolveInstrumentation(instrumentation);
  const idempotency = config.idempotency ?? new InMemoryIdempotencyStore();
  if (!config.secret) throw new BillingError('billing/config', 'Billing webhook handler requires a signing secret');

  async function dispatch(ctx: Context, event: BillingEvent): Promise<void> {
    const eventCtx: Context = { ...ctx, tenantId: event.tenantId ?? ctx.tenantId, identityType: 'webhook' };
    const typed = config.on?.[event.type] as ((c: Context, e: BillingEvent) => Promise<void>) | undefined;
    if (typed) await typed(eventCtx, event);
    if (config.onEvent) await config.onEvent(eventCtx, event);
  }

  return {
    async handle(ctx: Context | undefined, rawBody: Buffer | string, signature: string | undefined): Promise<BillingWebhookResult> {
      if (!signature) throw new BillingError('billing/webhook-invalid-signature', 'Missing webhook signature header');
      const baseCtx = ctx ?? createContext({ logger, identityType: 'webhook' });

      let providerEvent: Awaited<ReturnType<typeof config.adapter.parseWebhook>>;
      try {
        providerEvent = await config.adapter.parseWebhook(rawBody, signature, config.secret);
      } catch (err) {
        metrics?.increment('billing.webhook.signature_failed', 1);
        logger.warn({ traceId: baseCtx.traceId, error: (err as Error).message }, 'Billing webhook rejected');
        throw err;
      }

      const { id, type } = providerEvent;
      const log = { traceId: baseCtx.traceId, eventId: id, type };
      if (config.requireLivemode && !providerEvent.livemode) {
        logger.warn(log, 'Ignoring test-mode billing event');
        return { eventId: id, type, outcome: 'ignored', events: [] };
      }

      metrics?.increment('billing.webhook.received', 1, { type });
      const emitted: BillingEvent['type'][] = [];

      return withSpan(tracer, 'billing.webhook', { eventId: id, type }, async () => {
        try {
          const result = await runOnce(idempotency, `billing:${config.adapter.name}:${id}`, async () => {
            await config.store?.recordWebhookEvent({ id, type, status: 'processing', payload: serializeProviderEvent(providerEvent) });
            const events = await normalizeAndSync(providerEvent, config.store);
            for (const event of events) {
              await dispatch(baseCtx, event);
              emitted.push(event.type);
            }
            await config.store?.recordWebhookEvent({ id, type, status: events.length ? 'processed' : 'ignored' });
            return events.length;
          });

          if (result.status !== 'processed') {
            metrics?.increment('billing.webhook.deduplicated', 1, { type });
            logger.info({ ...log, outcome: result.status }, 'Duplicate billing webhook');
            return { eventId: id, type, outcome: result.status, events: [] };
          }
          metrics?.increment('billing.webhook.processed', 1, { type });
          logger.info({ ...log, emitted }, 'Billing webhook processed');
          return { eventId: id, type, outcome: result.result > 0 ? 'processed' : 'ignored', events: emitted };
        } catch (err) {
          metrics?.increment('billing.webhook.process_failed', 1, { type });
          logger.error({ ...log, error: (err as Error).message }, 'Billing webhook processing failed');
          await config.store
            ?.recordWebhookEvent({ id, type, status: 'failed', error: (err as Error).message })
            .catch(() => undefined);
          throw err;
        }
      });
    },

    /**
     * Re-runs a stored provider event. Use this for events left in `failed`.
     * Replay does not consult the idempotency claim, so a completed event can be applied again.
     */
    async replay(ctx: Context | undefined, eventId: string): Promise<BillingWebhookResult> {
      if (!config.store) throw new BillingError('billing/webhook-not-replayable', 'Replay requires a billing store');
      const stored = await config.store.getWebhookEvent(eventId);
      if (!stored) throw new BillingError('billing/webhook-not-found', `Webhook event ${eventId} not found`);
      const providerEvent = deserializeProviderEvent(stored.payload);
      const baseCtx = ctx ?? createContext({ logger, identityType: 'webhook' });
      const emitted: BillingEvent['type'][] = [];
      try {
        await config.store.recordWebhookEvent({ id: stored.id, type: stored.type, status: 'processing' });
        const events = await normalizeAndSync(providerEvent, config.store);
        for (const event of events) {
          await dispatch(baseCtx, event);
          emitted.push(event.type);
        }
        await config.store.recordWebhookEvent({ id: stored.id, type: stored.type, status: events.length ? 'processed' : 'ignored' });
        return { eventId: stored.id, type: stored.type, outcome: events.length ? 'processed' : 'ignored', events: emitted };
      } catch (err) {
        await config.store
          .recordWebhookEvent({ id: stored.id, type: stored.type, status: 'failed', error: (err as Error).message })
          .catch(() => undefined);
        throw err;
      }
    },
  };
}

function serializeProviderEvent(event: ProviderEvent): ProviderEvent & { createdAt: string } {
  return { ...event, createdAt: event.createdAt.toISOString() } as unknown as ProviderEvent & { createdAt: string };
}

function deserializeProviderEvent(payload: unknown): ProviderEvent {
  if (!payload || typeof payload !== 'object') {
    throw new BillingError('billing/webhook-not-replayable', 'Stored webhook has no provider payload');
  }
  const raw = payload as ProviderEvent & { createdAt: string | Date };
  return { ...raw, createdAt: raw.createdAt instanceof Date ? raw.createdAt : new Date(raw.createdAt) };
}

export type BillingWebhookHandler = ReturnType<typeof createBillingWebhookHandler>;
