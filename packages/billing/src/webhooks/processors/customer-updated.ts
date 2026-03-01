import type { WebhookEvent } from '../../types';
import type { WebhookHandlerContext } from '../webhook-types';

interface StripeCustomerData {
  id: string;
  email: string;
  name?: string;
  metadata?: Record<string, string>;
  delinquent?: boolean;
}

export async function processCustomerUpdated(event: WebhookEvent, ctx: WebhookHandlerContext): Promise<void> {
  const customer = event.payload as StripeCustomerData;

  ctx.logger.info(
    { externalId: customer.id, email: customer.email, delinquent: customer.delinquent },
    'Processing customer.updated webhook'
  );

  // TODO: Update billing_customers row (email, name, metadata, delinquent status)
  // TODO: If delinquent flag changed, emit "billing.customer.delinquency_changed" event

  ctx.metrics?.increment('billing.webhook.customer_updated.synced', 1);
}
