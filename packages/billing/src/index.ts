import { ConfigError } from '@mariachi/core';
import type { BillingAdapter, BillingConfig } from './types';
import { StripeAdapter } from './adapters/stripe';
import { MemoryBillingAdapter } from './adapters/memory';

export type {
  BillingConfig,
  BillingAdapter,
  BillingStore,
  BillingEvent,
  BillingEventType,
  BillingEventHandler,
  ProviderEvent,
  Customer,
  Subscription,
  SubscriptionStatus,
  Charge,
  Refund,
  Invoice,
  Dispute,
  CreditBalance,
  CreditTransaction,
  Plan,
  CheckoutSession,
  PortalSession,
  UsageRecord,
  UsageSummary,
  DateRange,
  CreateCustomerInput,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  CreateChargeInput,
  CreateCheckoutInput,
  IdempotencyOptions,
  WebhookEventStatus,
  StoredWebhookEvent,
} from './types';
export { ENTITLED_STATUSES } from './types';

export { Billing, DefaultBilling, type BillingServiceConfig } from './billing';
export { StripeAdapter, mapStripeError, type StripeAdapterConfig } from './adapters/stripe';
export { MemoryBillingAdapter } from './adapters/memory';
export { MemoryBillingStore } from './store/memory';
export {
  createBillingWebhookHandler,
  type BillingWebhookHandler,
  type BillingWebhookHandlerConfig,
  type BillingWebhookResult,
  type WebhookOutcome,
} from './webhooks/handler';
export { normalizeAndSync } from './webhooks/normalize';

export function createBillingAdapter(config: BillingConfig): BillingAdapter {
  switch (config.adapter) {
    case 'stripe':
      return new StripeAdapter(config);
    case 'memory':
      return new MemoryBillingAdapter();
    default:
      throw new ConfigError('billing/unknown-adapter', `Unknown billing adapter: ${String((config as { adapter: unknown }).adapter)}`);
  }
}

/** @deprecated Use `createBillingAdapter`. */
export const createBilling = createBillingAdapter;
