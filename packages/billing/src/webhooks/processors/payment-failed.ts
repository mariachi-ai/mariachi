import type { WebhookEvent } from '../../types';
import type { WebhookHandlerContext } from '../webhook-types';

interface StripePaymentIntentData {
  id: string;
  customer: string;
  amount: number;
  currency: string;
  last_payment_error?: { message?: string; code?: string };
  metadata?: Record<string, string>;
}

export async function processPaymentFailed(event: WebhookEvent, ctx: WebhookHandlerContext): Promise<void> {
  const payment = event.payload as StripePaymentIntentData;
  const failureReason = payment.last_payment_error?.message ?? 'unknown';
  const failureCode = payment.last_payment_error?.code;

  ctx.logger.warn(
    { externalId: payment.id, customerId: payment.customer, amount: payment.amount, failureReason, failureCode },
    'Processing payment_intent.payment_failed webhook'
  );

  // TODO: Upsert billing_charges row with status "failed" and failureReason
  // TODO: Emit domain event "billing.payment.failed" for dunning workflows
  // TODO: Trigger failed-payment notification to customer
  // TODO: If retryable, schedule automatic retry via job queue

  ctx.metrics?.increment('billing.webhook.payment_failed.synced', 1, { code: failureCode ?? 'unknown' });
}
