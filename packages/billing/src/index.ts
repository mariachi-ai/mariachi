export type {
  BillingConfig,
  Customer,
  Subscription,
  Charge,
  CreditBalance,
  BillingAdapter,
  WebhookEvent,
  WebhookProcessor,
  Refund,
  CreditTransaction,
  UsageRecord,
  UsageSummary,
  Invoice,
  Plan,
  DateRange,
} from './types';

export { Billing, DefaultBilling } from './billing';
export type { BillingConfig as BillingClassConfig } from './billing';

export { StripeAdapter } from './adapters/stripe';

export { createWebhookHandler } from './webhooks/handler';
export type { WebhookHandlerConfig, WebhookHandlerContext, WebhookProcessorFn } from './webhooks/handler';

export { processCustomerCreated } from './webhooks/processors/customer-created';
export { processCustomerUpdated } from './webhooks/processors/customer-updated';
export { processSubscriptionCreated } from './webhooks/processors/subscription-created';
export { processSubscriptionUpdated } from './webhooks/processors/subscription-updated';
export { processSubscriptionDeleted } from './webhooks/processors/subscription-deleted';
export { processPaymentSucceeded } from './webhooks/processors/payment-succeeded';
export { processPaymentFailed } from './webhooks/processors/payment-failed';
export { processInvoicePaid } from './webhooks/processors/invoice-paid';
export { processChargeRefunded } from './webhooks/processors/charge-refunded';
export { processDisputeCreated } from './webhooks/processors/dispute-created';

export { SubscriptionService } from './features/subscriptions';
export type { SubscriptionServiceConfig } from './features/subscriptions';
export { CreditService } from './features/credits';

export * from './schema/index';

import type { BillingConfig } from './types';
import { StripeAdapter } from './adapters/stripe';

export function createBilling(config: BillingConfig) {
  if (config.adapter === 'stripe') {
    if (!config.secretKey) {
      throw new Error('Stripe adapter requires secretKey');
    }
    return new StripeAdapter({ secretKey: config.secretKey });
  }
  throw new Error(`Unknown billing adapter: ${config.adapter}`);
}
