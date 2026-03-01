import type { WebhookEvent } from '../../types';
import type { WebhookHandlerContext } from '../webhook-types';

interface StripeCustomerData {
  id: string;
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}

export async function processCustomerCreated(event: WebhookEvent, ctx: WebhookHandlerContext): Promise<void> {
  const customer = event.payload as StripeCustomerData;

  ctx.logger.info(
    { externalId: customer.id, email: customer.email, name: customer.name },
    'Processing customer.created webhook'
  );

  // TODO: Upsert billing_customers row with externalId, email, name, metadata
  // TODO: Emit domain event "billing.customer.synced" for downstream consumers

  ctx.metrics?.increment('billing.webhook.customer_created.synced', 1);
}
