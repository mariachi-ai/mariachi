import type { WebhookEvent } from '../../types';
import type { WebhookHandlerContext } from '../webhook-types';

interface StripeSubscriptionData {
  id: string;
  customer: string;
  status: string;
  items: { data: Array<{ price: { id: string } }> };
  current_period_start: number;
  current_period_end: number;
  trial_end?: number | null;
  metadata?: Record<string, string>;
}

export async function processSubscriptionCreated(event: WebhookEvent, ctx: WebhookHandlerContext): Promise<void> {
  const sub = event.payload as StripeSubscriptionData;
  const planId = sub.items?.data?.[0]?.price?.id ?? 'unknown';

  ctx.logger.info(
    { externalId: sub.id, customerId: sub.customer, status: sub.status, planId },
    'Processing subscription.created webhook'
  );

  // TODO: Insert billing_subscriptions row with period dates, trial info, plan
  // TODO: Resolve tenantId from billing_customers via customer externalId
  // TODO: Emit domain event "billing.subscription.created"

  ctx.metrics?.increment('billing.webhook.subscription_created.synced', 1);
}
