import type { WebhookEvent } from '../../types';
import type { WebhookHandlerContext } from '../webhook-types';

interface StripeChargeData {
  id: string;
  customer: string;
  amount: number;
  amount_refunded: number;
  currency: string;
  refunds?: { data: Array<{ id: string; amount: number; reason?: string; status: string }> };
}

export async function processChargeRefunded(event: WebhookEvent, ctx: WebhookHandlerContext): Promise<void> {
  const charge = event.payload as StripeChargeData;
  const latestRefund = charge.refunds?.data?.[0];

  ctx.logger.info(
    {
      chargeId: charge.id,
      customerId: charge.customer,
      amountRefunded: charge.amount_refunded,
      refundId: latestRefund?.id,
      refundAmount: latestRefund?.amount,
    },
    'Processing charge.refunded webhook'
  );

  // TODO: Insert billing_refunds row linked to billing_charges
  // TODO: If credits were purchased, reverse the credit transaction
  // TODO: Update billing_charges status if fully refunded
  // TODO: Emit domain event "billing.refund.created"

  ctx.metrics?.increment('billing.webhook.charge_refunded.synced', 1);
  if (latestRefund) {
    ctx.metrics?.histogram('billing.webhook.charge_refunded.amount', latestRefund.amount, { currency: charge.currency });
  }
}
