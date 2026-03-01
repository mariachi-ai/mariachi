import Stripe from 'stripe';
import type { Logger } from '@mariachi/core';
import type { MetricsAdapter } from '@mariachi/core';
import type { BillingAdapter, WebhookEvent } from '../types';
import type { WebhookHandlerContext, WebhookProcessorFn } from './webhook-types';
import { processCustomerCreated } from './processors/customer-created';
import { processCustomerUpdated } from './processors/customer-updated';
import { processSubscriptionCreated } from './processors/subscription-created';
import { processSubscriptionUpdated } from './processors/subscription-updated';
import { processSubscriptionDeleted } from './processors/subscription-deleted';
import { processPaymentSucceeded } from './processors/payment-succeeded';
import { processPaymentFailed } from './processors/payment-failed';
import { processInvoicePaid } from './processors/invoice-paid';
import { processChargeRefunded } from './processors/charge-refunded';
import { processDisputeCreated } from './processors/dispute-created';

export type { WebhookProcessorFn, WebhookHandlerContext } from './webhook-types';

export interface WebhookHandlerConfig {
  secret: string;
  adapter: BillingAdapter;
  logger: Logger;
  metrics?: MetricsAdapter;
  onEvent?: (type: string, data: unknown) => Promise<void>;
}

const PROCESSOR_MAP: Record<string, WebhookProcessorFn> = {
  'customer.created': processCustomerCreated,
  'customer.updated': processCustomerUpdated,
  'customer.subscription.created': processSubscriptionCreated,
  'customer.subscription.updated': processSubscriptionUpdated,
  'customer.subscription.deleted': processSubscriptionDeleted,
  'payment_intent.succeeded': processPaymentSucceeded,
  'payment_intent.payment_failed': processPaymentFailed,
  'invoice.paid': processInvoicePaid,
  'charge.refunded': processChargeRefunded,
  'charge.dispute.created': processDisputeCreated,
};

const processedEventIds = new Set<string>();

export function createWebhookHandler(config: WebhookHandlerConfig) {
  const { secret, adapter, logger, metrics, onEvent } = config;

  const ctx: WebhookHandlerContext = { logger, metrics, adapter };

  return {
    async verifyAndProcess(
      rawBody: string | Buffer,
      signature: string
    ): Promise<{ event: Stripe.Event; processed: boolean }> {
      const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');

      let event: Stripe.Event;
      try {
        event = Stripe.webhooks.constructEvent(body, signature, secret);
      } catch (err) {
        logger.error({ error: (err as Error).message }, 'Webhook signature verification failed');
        metrics?.increment('billing.webhook.signature_failed', 1);
        throw err;
      }

      if (processedEventIds.has(event.id)) {
        logger.info({ eventId: event.id, type: event.type }, 'Duplicate webhook event, skipping');
        metrics?.increment('billing.webhook.deduplicated', 1);
        return { event, processed: false };
      }

      processedEventIds.add(event.id);
      logger.info({ eventId: event.id, type: event.type }, 'Processing webhook event');
      metrics?.increment('billing.webhook.received', 1, { type: event.type });

      const webhookEvent: WebhookEvent = {
        type: event.type,
        payload: event.data.object,
        signature,
      };

      const processor = PROCESSOR_MAP[event.type];
      if (processor) {
        try {
          await processor(webhookEvent, ctx);
          metrics?.increment('billing.webhook.processed', 1, { type: event.type });
          logger.info({ eventId: event.id, type: event.type }, 'Webhook event processed successfully');
        } catch (err) {
          metrics?.increment('billing.webhook.process_failed', 1, { type: event.type });
          logger.error({ eventId: event.id, type: event.type, error: (err as Error).message }, 'Webhook processor failed');
          throw err;
        }
      } else {
        logger.info({ eventId: event.id, type: event.type }, 'No processor registered for event type');
        metrics?.increment('billing.webhook.unhandled', 1, { type: event.type });
      }

      if (onEvent) {
        await onEvent(event.type, event.data.object);
      }

      return { event, processed: !!processor };
    },
  };
}
