import type { WebhookEvent } from '../../types';
import type { WebhookHandlerContext } from '../webhook-types';

interface StripeSubscriptionData {
  id: string;
  customer: string;
  status: string;
  items: { data: Array<{ price: { id: string } }> };
  current_period_start: number;
  current_period_end: number;
  cancel_at?: number | null;
  canceled_at?: number | null;
  trial_end?: number | null;
  metadata?: Record<string, string>;
}

export async function processSubscriptionUpdated(event: WebhookEvent, ctx: WebhookHandlerContext): Promise<void> {
  const sub = event.payload as StripeSubscriptionData;
  const planId = sub.items?.data?.[0]?.price?.id ?? 'unknown';

  ctx.logger.info(
    { externalId: sub.id, customerId: sub.customer, status: sub.status, planId },
    'Processing subscription.updated webhook'
  );

  // TODO: Update billing_subscriptions row (status, period dates, cancel timestamps)
  // TODO: If status transitioned to past_due, emit "billing.subscription.past_due"
  // TODO: If plan changed, emit "billing.subscription.plan_changed"
  // TODO: Update tenant feature flags based on new plan if applicable

  ctx.metrics?.increment('billing.webhook.subscription_updated.synced', 1);
}
