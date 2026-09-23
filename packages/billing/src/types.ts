import type { Context } from '@mariachi/core';

export type BillingConfig =
  | {
      adapter: 'stripe';
      secretKey: string;
      webhookSecret?: string;
      apiVersion?: string;
      maxNetworkRetries?: number;
      timeoutMs?: number;
    }
  | { adapter: 'memory'; webhookSecret?: string };

// ── Domain models (amounts are integers in the currency's minor unit) ──────────

export interface Customer {
  /** Provider id, e.g. `cus_...`. */
  id: string;
  email: string | null;
  name: string | null;
  tenantId: string | null;
  delinquent: boolean;
  metadata: Record<string, string>;
}

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused';

export interface Subscription {
  id: string;
  customerId: string;
  tenantId: string | null;
  /** Price id of the first item. */
  planId: string;
  quantity: number;
  status: SubscriptionStatus;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: Date | null;
  canceledAt: Date | null;
  trialEnd: Date | null;
  metadata: Record<string, string>;
}

/** Subscriptions in these states grant access to paid features. */
export const ENTITLED_STATUSES: ReadonlySet<SubscriptionStatus> = new Set(['active', 'trialing', 'past_due']);

export interface Charge {
  /** Payment intent id (`pi_...`). */
  id: string;
  customerId: string;
  tenantId: string | null;
  amount: number;
  amountRefunded: number;
  currency: string;
  status: 'succeeded' | 'failed' | 'pending' | 'requires_action' | 'canceled';
  description: string | null;
  failureCode: string | null;
  failureReason: string | null;
  invoiceId: string | null;
  metadata: Record<string, string>;
}

export interface Refund {
  id: string;
  /** Payment intent or charge id the refund belongs to. */
  chargeId: string;
  tenantId: string | null;
  amount: number;
  currency: string;
  reason: string | null;
  status: 'succeeded' | 'failed' | 'pending' | 'canceled' | 'requires_action';
}

export interface Invoice {
  id: string;
  customerId: string;
  subscriptionId: string | null;
  tenantId: string | null;
  number: string | null;
  amountDue: number;
  amountPaid: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
  hostedUrl: string | null;
  pdfUrl: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  paidAt: Date | null;
}

export interface Dispute {
  id: string;
  chargeId: string;
  tenantId: string | null;
  amount: number;
  currency: string;
  reason: string;
  status: string;
  evidenceDueBy: Date | null;
}

export interface CreditBalance {
  customerId: string;
  /** Positive: credit available. Negative: amount owed. */
  balance: number;
  currency: string;
}

export interface Plan {
  id: string;
  productId: string;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  interval: 'day' | 'week' | 'month' | 'year' | null;
  active: boolean;
  metadata: Record<string, string>;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

export interface PortalSession {
  url: string;
}

export interface UsageRecord {
  customerId: string;
  tenantId: string;
  metricName: string;
  quantity: number;
  timestamp: Date;
  idempotencyKey?: string;
}

export interface UsageSummary {
  metricName: string;
  totalQuantity: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface DateRange {
  from: Date;
  to: Date;
}

export interface CreditTransaction {
  id: string;
  tenantId: string;
  customerId: string;
  amount: number;
  currency: string;
  balanceAfter: number;
  description: string;
  referenceType?: string | null;
  referenceId?: string | null;
  idempotencyKey?: string | null;
  createdAt: Date;
}

// ── Provider port ─────────────────────────────────────────────────────────────

export interface IdempotencyOptions {
  idempotencyKey?: string;
}

export interface CreateCustomerInput {
  email: string;
  name?: string;
  tenantId: string;
  metadata?: Record<string, string>;
}

export interface CreateSubscriptionInput {
  customerId: string;
  priceId: string;
  quantity?: number;
  trialDays?: number;
  metadata?: Record<string, string>;
}

export interface UpdateSubscriptionInput {
  priceId?: string;
  quantity?: number;
  prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice';
  metadata?: Record<string, string>;
}

export interface CreateChargeInput {
  customerId: string;
  amount: number;
  currency: string;
  description?: string;
  paymentMethodId?: string;
  metadata?: Record<string, string>;
}

export interface CreateCheckoutInput {
  customerId: string;
  priceId: string;
  mode: 'subscription' | 'payment';
  successUrl: string;
  cancelUrl: string;
  quantity?: number;
  trialDays?: number;
  allowPromotionCodes?: boolean;
  metadata?: Record<string, string>;
}

/** A verified provider webhook event. */
export interface ProviderEvent {
  id: string;
  type: string;
  createdAt: Date;
  object: Record<string, unknown>;
  previousAttributes?: Record<string, unknown>;
  livemode: boolean;
}

/**
 * Low-level payment provider port. Services talk to `Billing`, never to adapters.
 */
export interface BillingAdapter {
  readonly name: string;

  createCustomer(input: CreateCustomerInput, opts?: IdempotencyOptions): Promise<Customer>;
  getCustomer(id: string): Promise<Customer | null>;
  updateCustomer(id: string, patch: { email?: string; name?: string; metadata?: Record<string, string> }): Promise<Customer>;

  createSubscription(input: CreateSubscriptionInput, opts?: IdempotencyOptions): Promise<Subscription>;
  updateSubscription(id: string, patch: UpdateSubscriptionInput, opts?: IdempotencyOptions): Promise<Subscription>;
  cancelSubscription(id: string, options?: { atPeriodEnd?: boolean }): Promise<Subscription>;
  /** Pauses collection. The subscription stays in place and can be resumed. */
  pauseSubscription(id: string): Promise<Subscription>;
  resumeSubscription(id: string): Promise<Subscription>;
  getSubscription(id: string): Promise<Subscription | null>;
  listSubscriptions(customerId: string): Promise<Subscription[]>;

  createCharge(input: CreateChargeInput, opts?: IdempotencyOptions): Promise<Charge>;
  refund(chargeId: string, options?: { amount?: number; reason?: string }, opts?: IdempotencyOptions): Promise<Refund>;

  createCheckoutSession(input: CreateCheckoutInput, opts?: IdempotencyOptions): Promise<CheckoutSession>;
  createPortalSession(customerId: string, returnUrl: string): Promise<PortalSession>;
  listInvoices(customerId: string, options?: { limit?: number }): Promise<Invoice[]>;
  listPlans(options?: { activeOnly?: boolean }): Promise<Plan[]>;

  reportUsage(input: { customerId: string; metricName: string; quantity: number; timestamp: Date; idempotencyKey?: string }): Promise<void>;

  getCreditBalance(customerId: string, currency?: string): Promise<CreditBalance>;
  /** Positive `amount` grants credit, negative adds a debit. */
  adjustCreditBalance(customerId: string, amount: number, currency: string, description?: string, opts?: IdempotencyOptions): Promise<CreditBalance>;

  /** Verifies the signature and parses the payload. Throws `billing/webhook-invalid-signature`. */
  parseWebhook(rawBody: Buffer | string, signature: string, secret: string): Promise<ProviderEvent>;

  isHealthy(): Promise<boolean>;
}

// ── Normalized events emitted from webhooks ─────────────────────────────────────

interface EventBase {
  eventId: string;
  occurredAt: Date;
  tenantId: string | null;
  providerType: string;
}

export type BillingEvent =
  | (EventBase & { type: 'customer.synced'; customer: Customer })
  | (EventBase & { type: 'customer.deleted'; customerId: string })
  | (EventBase & { type: 'subscription.synced'; subscription: Subscription; previousStatus: SubscriptionStatus | null })
  | (EventBase & { type: 'subscription.canceled'; subscription: Subscription })
  | (EventBase & { type: 'subscription.trial_will_end'; subscription: Subscription })
  | (EventBase & { type: 'invoice.paid'; invoice: Invoice })
  | (EventBase & { type: 'invoice.payment_failed'; invoice: Invoice })
  | (EventBase & { type: 'payment.succeeded'; charge: Charge })
  | (EventBase & { type: 'payment.failed'; charge: Charge })
  | (EventBase & { type: 'charge.refunded'; refund: Refund; charge: Charge })
  | (EventBase & { type: 'dispute.created'; dispute: Dispute })
  | (EventBase & { type: 'dispute.closed'; dispute: Dispute })
  | (EventBase & { type: 'checkout.completed'; sessionId: string; customerId: string | null; subscriptionId: string | null; mode: string })
  | (EventBase & { type: 'plan.synced'; plan: Plan });

export type BillingEventType = BillingEvent['type'];

// ── Persistence port ────────────────────────────────────────────────────────────

export type WebhookEventStatus = 'processing' | 'processed' | 'failed' | 'ignored';

export interface StoredWebhookEvent {
  id: string;
  type: string;
  status: WebhookEventStatus;
  error?: string | null;
  attempts: number;
  payload?: unknown;
}

/**
 * Local mirror of provider state. Upserts carry the provider event time and must
 * ignore writes older than what is stored, since webhooks arrive out of order.
 * Implementations: `MemoryBillingStore`, `DrizzleBillingStore` (`@mariachi/billing/postgres`).
 */
export interface BillingStore {
  upsertCustomer(customer: Customer, occurredAt: Date): Promise<void>;
  markCustomerDeleted(customerId: string, occurredAt: Date): Promise<void>;
  findCustomer(customerId: string): Promise<Customer | null>;
  findCustomerByTenant(tenantId: string): Promise<Customer | null>;

  upsertSubscription(subscription: Subscription, occurredAt: Date): Promise<{ applied: boolean; previousStatus: SubscriptionStatus | null }>;
  findSubscription(id: string): Promise<Subscription | null>;
  listSubscriptionsByTenant(tenantId: string): Promise<Subscription[]>;

  upsertCharge(charge: Charge, occurredAt: Date): Promise<void>;
  upsertRefund(refund: Refund): Promise<void>;
  upsertInvoice(invoice: Invoice, occurredAt: Date): Promise<void>;
  upsertDispute(dispute: Dispute, occurredAt: Date): Promise<void>;

  /** Mirrors a provider price. Older events than the stored one are ignored. */
  upsertPlan(plan: Plan, occurredAt: Date): Promise<void>;
  listPlans(options?: { activeOnly?: boolean }): Promise<Plan[]>;

  recordWebhookEvent(event: { id: string; type: string; status: WebhookEventStatus; error?: string; payload?: unknown }): Promise<void>;
  getWebhookEvent(id: string): Promise<StoredWebhookEvent | null>;
  listWebhookEvents(filter?: { status?: WebhookEventStatus }): Promise<StoredWebhookEvent[]>;

  /** Records usage once per idempotency key. Returns false for a duplicate. */
  recordUsage(record: UsageRecord): Promise<boolean>;
  summarizeUsage(tenantId: string, metricName: string, range: DateRange): Promise<UsageSummary>;

  /**
   * Appends a ledger entry atomically. Rejects with `billing/insufficient-credits`
   * if the resulting balance would be negative and `allowNegative` is false.
   * Returns the existing entry when `idempotencyKey` was already used.
   */
  appendCreditTransaction(
    entry: Omit<CreditTransaction, 'id' | 'balanceAfter' | 'createdAt'>,
    options?: { allowNegative?: boolean },
  ): Promise<CreditTransaction>;
  getCreditLedgerBalance(tenantId: string, customerId: string, currency: string): Promise<number>;
  listCreditTransactions(tenantId: string, customerId: string, options?: { limit?: number }): Promise<CreditTransaction[]>;
}

export type BillingEventHandler = (ctx: Context, event: BillingEvent) => Promise<void>;
