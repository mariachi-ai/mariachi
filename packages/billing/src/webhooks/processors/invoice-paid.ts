import type { WebhookEvent } from '../../types';
import type { WebhookHandlerContext } from '../webhook-types';

interface StripeInvoiceData {
  id: string;
  customer: string;
  subscription?: string;
  amount_paid: number;
  currency: string;
  status: string;
  hosted_invoice_url?: string;
  invoice_pdf?: string;
  period_start: number;
  period_end: number;
  lines?: { data: Array<{ price?: { id: string } }> };
}

export async function processInvoicePaid(event: WebhookEvent, ctx: WebhookHandlerContext): Promise<void> {
  const invoice = event.payload as StripeInvoiceData;

  ctx.logger.info(
    {
      externalId: invoice.id,
      customerId: invoice.customer,
      subscriptionId: invoice.subscription,
      amount: invoice.amount_paid,
      currency: invoice.currency,
    },
    'Processing invoice.paid webhook'
  );

  // TODO: Store invoice record with PDF URL and period dates
  // TODO: If subscription renewal, extend currentPeriodEnd in billing_subscriptions
  // TODO: Emit domain event "billing.invoice.paid"
  // TODO: Send receipt notification with invoice PDF link

  ctx.metrics?.increment('billing.webhook.invoice_paid.synced', 1);
  ctx.metrics?.histogram('billing.webhook.invoice_paid.amount', invoice.amount_paid, { currency: invoice.currency });
}
