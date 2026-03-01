import type { WebhookEvent } from '../../types';
import type { WebhookHandlerContext } from '../webhook-types';

interface StripePaymentIntentData {
  id: string;
  customer: string;
  amount: number;
  currency: string;
  status: string;
  metadata?: Record<string, string>;
}

export async function processPaymentSucceeded(event: WebhookEvent, ctx: WebhookHandlerContext): Promise<void> {
  const payment = event.payload as StripePaymentIntentData;

  ctx.logger.info(
    { externalId: payment.id, customerId: payment.customer, amount: payment.amount, currency: payment.currency },
    'Processing payment_intent.succeeded webhook'
  );

  // TODO: Upsert billing_charges row with status "succeeded"
  // TODO: If this was a credit purchase, add credits via billing_credit_transactions
  // TODO: Emit domain event "billing.payment.succeeded"
  // TODO: Trigger receipt/confirmation notification

  ctx.metrics?.increment('billing.webhook.payment_succeeded.synced', 1);
  ctx.metrics?.histogram('billing.webhook.payment_succeeded.amount', payment.amount, { currency: payment.currency });
}
