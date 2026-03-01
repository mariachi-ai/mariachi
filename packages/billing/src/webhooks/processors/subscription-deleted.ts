import type { WebhookEvent } from '../../types';
import type { WebhookHandlerContext } from '../webhook-types';

interface StripeSubscriptionData {
  id: string;
  customer: string;
  status: string;
  canceled_at?: number | null;
}

export async function processSubscriptionDeleted(event: WebhookEvent, ctx: WebhookHandlerContext): Promise<void> {
  const sub = event.payload as StripeSubscriptionData;

  ctx.logger.info(
    { externalId: sub.id, customerId: sub.customer },
    'Processing subscription.deleted webhook'
  );

  // TODO: Mark billing_subscriptions row as canceled, set canceledAt
  // TODO: Downgrade tenant to free plan or revoke access
  // TODO: Emit domain event "billing.subscription.deleted"
  // TODO: Schedule grace-period cleanup job if applicable

  ctx.metrics?.increment('billing.webhook.subscription_deleted.synced', 1);
}
