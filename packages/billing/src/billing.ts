import { randomUUID } from 'node:crypto';
import type { Context, Instrumentable, Logger, MetricsAdapter, TracerAdapter } from '@mariachi/core';
import { BillingError, resolveInstrumentation, withSpan, type InstrumentationDeps } from '@mariachi/core';
import {
  ENTITLED_STATUSES,
  type BillingAdapter,
  type BillingStore,
  type Charge,
  type CheckoutSession,
  type CreateCheckoutInput,
  type CreditSummary,
  type CreditTransaction,
  type Customer,
  type DateRange,
  type Dimensions,
  type Invoice,
  type Plan,
  type PortalSession,
  type Refund,
  type SetCreditBalanceResult,
  type Subscription,
  type SubscriptionItemInput,
  type SubscriptionChangePreview,
  type UpdateSubscriptionInput,
  type UsageBreakdown,
  type UsageSummary,
} from './types';

export interface BillingServiceConfig {
  adapter: BillingAdapter;
  store: BillingStore;
  defaultCurrency?: string;
}

function requireTenant(ctx: Context): string {
  if (!ctx.tenantId) throw new BillingError('billing/tenant-required', 'Billing operations require ctx.tenantId');
  return ctx.tenantId;
}

/** Uses the caller's key when present. An omitted key is generated so retries of the same call stay explicit. */
function resolveKey(key: string | undefined, operation: string): string {
  if (key === '') throw new BillingError('billing/idempotency-key-required', `${operation} requires an idempotencyKey`);
  return key ?? `mariachi:${operation}:${randomUUID()}`;
}

function invalid(message: string): BillingError {
  return new BillingError('billing/invalid-input', message);
}

/** Checks the `priceId` / `items` pair. `required`: one of them must be given. */
function checkPrices(input: { priceId?: string; quantity?: number; items?: SubscriptionItemInput[] }, required: boolean): void {
  if (input.priceId !== undefined && input.items !== undefined) throw invalid('Give either priceId or items, not both');
  if (input.items === undefined) {
    if (required && !input.priceId) throw invalid('priceId or items is required');
    return;
  }
  if (input.quantity !== undefined) throw invalid('With items, give each item its own quantity');
  if (input.items.length === 0) throw invalid('items must list at least one price');
  const seen = new Set<string>();
  for (const item of input.items) {
    if (!item.priceId) throw invalid('Every item needs a priceId');
    if (seen.has(item.priceId)) throw invalid(`Price ${item.priceId} is listed twice`);
    seen.add(item.priceId);
    if (item.quantity !== undefined && (!Number.isInteger(item.quantity) || item.quantity < 0)) {
      throw invalid('An item quantity must be a non-negative integer');
    }
  }
}

const MAX_DIMENSIONS = 16;
const MAX_DIMENSION_LENGTH = 128;

/** Validates caller dimensions. Returns null for none, so stores keep a single "unlabelled" value. */
function checkDimensions(dimensions: Dimensions | undefined): Dimensions | null {
  if (dimensions === undefined || dimensions === null) return null;
  const entries = Object.entries(dimensions);
  if (entries.length > MAX_DIMENSIONS) throw invalid(`dimensions allows at most ${MAX_DIMENSIONS} keys`);
  for (const [key, value] of entries) {
    if (!key || key.length > MAX_DIMENSION_LENGTH || typeof value !== 'string' || value.length > MAX_DIMENSION_LENGTH) {
      throw invalid(`dimensions keys and values must be strings of 1 to ${MAX_DIMENSION_LENGTH} characters`);
    }
  }
  return entries.length > 0 ? { ...dimensions } : null;
}

function checkGroupBy(groupBy: string): string {
  if (typeof groupBy !== 'string' || !groupBy || groupBy.length > MAX_DIMENSION_LENGTH) {
    throw invalid(`groupBy must be a dimension key of 1 to ${MAX_DIMENSION_LENGTH} characters`);
  }
  return groupBy;
}

interface LedgerOptions {
  description: string;
  currency?: string;
  referenceType?: string;
  referenceId?: string;
  idempotencyKey?: string;
  dimensions?: Dimensions;
}

/**
 * Tenant-bound billing service. One provider customer per tenant; every lookup is
 * checked against `ctx.tenantId` so one tenant can never read or mutate another's
 * subscriptions or charges. Money-moving calls require an idempotency key.
 *
 * Extend it to react to direct API outcomes; react to asynchronous provider state
 * (renewals, dunning, disputes) through `createBillingWebhookHandler`.
 */
export abstract class Billing implements Instrumentable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly adapter: BillingAdapter;
  protected readonly store: BillingStore;
  protected readonly defaultCurrency: string;

  constructor(config: BillingServiceConfig, instrumentation?: InstrumentationDeps) {
    const resolved = resolveInstrumentation(instrumentation);
    this.logger = resolved.logger;
    this.tracer = resolved.tracer;
    this.metrics = resolved.metrics;
    this.adapter = config.adapter;
    this.store = config.store;
    this.defaultCurrency = (config.defaultCurrency ?? 'usd').toLowerCase();
  }

  // ── Customers ──────────────────────────────────────────────────────────────

  /**
   * Returns the tenant's customer, creating it on first use. Safe to call concurrently.
   *
   * With `verify`, the stored customer is first looked up with the provider (one call), and one
   * the provider doesn't have is replaced by a new one, its credit ledger and usage moving with it
   * (`BillingStore.replaceCustomer`). That happens when the customer was deleted at the provider,
   * or was made by another adapter (the memory adapter's, before a provider was configured). Pass
   * it before calls that send the customer's id to the provider: checkout, the portal, invoices.
   */
  async ensureCustomer(
    ctx: Context,
    input: { email: string; name?: string; metadata?: Record<string, string> },
    options: { verify?: boolean } = {},
  ): Promise<Customer> {
    const tenantId = requireTenant(ctx);
    return withSpan(this.tracer, 'billing.ensureCustomer', { tenantId }, async () => {
      const existing = await this.store.findCustomerByTenant(tenantId);
      if (existing && (!options.verify || (await this.adapter.getCustomer(existing.id)))) return existing;
      const customer = await this.adapter.createCustomer(
        { ...input, tenantId },
        { idempotencyKey: existing ? `mariachi:customer:${tenantId}:replaces:${existing.id}` : `mariachi:customer:${tenantId}` },
      );
      if (existing) {
        await this.store.replaceCustomer(existing.id, customer, new Date());
        this.metrics?.increment('billing.customer.replaced', 1);
        this.logger.warn(
          { traceId: ctx.traceId, tenantId, customerId: customer.id, replaced: existing.id },
          'Billing customer replaced: the provider has no customer with the stored id',
        );
      } else {
        await this.store.upsertCustomer(customer, new Date());
        this.metrics?.increment('billing.customer.created', 1);
        this.logger.info({ traceId: ctx.traceId, tenantId, customerId: customer.id }, 'Billing customer created');
      }
      await this.onCustomerCreated?.(ctx, customer);
      return customer;
    });
  }

  async getCustomer(ctx: Context): Promise<Customer | null> {
    return this.store.findCustomerByTenant(requireTenant(ctx));
  }

  protected async requireCustomer(ctx: Context): Promise<Customer> {
    const customer = await this.getCustomer(ctx);
    if (!customer) throw new BillingError('billing/customer-not-found', 'Tenant has no billing customer; call ensureCustomer first');
    return customer;
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────

  /** Give either `priceId` (with an optional `quantity`) or `items`, one entry per price. */
  async subscribe(
    ctx: Context,
    input: {
      priceId?: string;
      quantity?: number;
      items?: SubscriptionItemInput[];
      trialDays?: number;
      metadata?: Record<string, string>;
      idempotencyKey?: string;
    },
  ): Promise<Subscription> {
    checkPrices(input, true);
    const customer = await this.requireCustomer(ctx);
    const priceId = input.priceId ?? input.items!.map((i) => i.priceId).join(',');
    return withSpan(this.tracer, 'billing.subscribe', { priceId }, async () => {
      const current = (await this.listSubscriptions(ctx)).find((s) => ENTITLED_STATUSES.has(s.status));
      if (current) {
        throw new BillingError('billing/subscription-exists', 'Tenant already has an active subscription; use changePlan', {
          subscriptionId: current.id,
        });
      }
      const sub = await this.adapter.createSubscription(
        {
          customerId: customer.id,
          priceId: input.priceId,
          quantity: input.quantity,
          items: input.items,
          trialDays: input.trialDays,
          metadata: input.metadata,
        },
        { idempotencyKey: resolveKey(input.idempotencyKey, 'subscribe') },
      );
      await this.store.upsertSubscription({ ...sub, tenantId: ctx.tenantId }, new Date());
      this.metrics?.increment('billing.subscription.created', 1);
      await this.onSubscriptionCreated?.(ctx, sub);
      return sub;
    });
  }

  async getSubscription(ctx: Context, subscriptionId: string): Promise<Subscription> {
    const tenantId = requireTenant(ctx);
    const local = await this.store.findSubscription(subscriptionId);
    const sub = local ?? (await this.adapter.getSubscription(subscriptionId));
    if (!sub || (sub.tenantId && sub.tenantId !== tenantId)) {
      throw new BillingError('billing/subscription-not-found', `Subscription ${subscriptionId} not found`);
    }
    if (!sub.tenantId) {
      const customer = await this.requireCustomer(ctx);
      if (sub.customerId !== customer.id) throw new BillingError('billing/subscription-not-found', `Subscription ${subscriptionId} not found`);
    }
    return sub;
  }

  async listSubscriptions(ctx: Context): Promise<Subscription[]> {
    return this.store.listSubscriptionsByTenant(requireTenant(ctx));
  }

  /** True when the tenant has an entitled subscription, optionally with one of `planIds` among its prices. */
  async hasActiveSubscription(ctx: Context, planIds?: string[]): Promise<boolean> {
    const subs = await this.listSubscriptions(ctx);
    return subs.some(
      (s) =>
        ENTITLED_STATUSES.has(s.status) &&
        (!planIds || planIds.includes(s.planId) || s.items.some((item) => planIds.includes(item.priceId))),
    );
  }

  /** `items` replaces the subscription's prices; `priceId` / `quantity` change the first item only. */
  async changePlan(ctx: Context, subscriptionId: string, patch: UpdateSubscriptionInput & { idempotencyKey?: string }): Promise<Subscription> {
    checkPrices(patch, false);
    await this.getSubscription(ctx, subscriptionId);
    const { idempotencyKey, ...rest } = patch;
    const sub = await this.adapter.updateSubscription(subscriptionId, rest, { idempotencyKey: resolveKey(idempotencyKey, 'changePlan') });
    await this.store.upsertSubscription({ ...sub, tenantId: ctx.tenantId }, new Date());
    return sub;
  }

  /**
   * What `changePlan(ctx, subscriptionId, patch)` would bill, without making the change: for a
   * confirmation. Pass the result's `prorationDate` to `changePlan` so it bills what was shown.
   */
  async previewPlanChange(ctx: Context, subscriptionId: string, patch: UpdateSubscriptionInput): Promise<SubscriptionChangePreview> {
    checkPrices(patch, false);
    await this.getSubscription(ctx, subscriptionId);
    return this.adapter.previewSubscriptionChange(subscriptionId, patch);
  }

  async cancelSubscription(ctx: Context, subscriptionId: string, options: { atPeriodEnd?: boolean; reason?: string } = {}): Promise<Subscription> {
    await this.getSubscription(ctx, subscriptionId);
    return withSpan(this.tracer, 'billing.cancelSubscription', { subscriptionId }, async () => {
      const sub = await this.adapter.cancelSubscription(subscriptionId, { atPeriodEnd: options.atPeriodEnd ?? true });
      await this.store.upsertSubscription({ ...sub, tenantId: ctx.tenantId }, new Date());
      this.logger.info({ traceId: ctx.traceId, subscriptionId, reason: options.reason }, 'Subscription canceled');
      this.metrics?.increment('billing.subscription.canceled', 1);
      await this.onSubscriptionCanceled?.(ctx, sub);
      return sub;
    });
  }

  async pauseSubscription(ctx: Context, subscriptionId: string): Promise<Subscription> {
    await this.getSubscription(ctx, subscriptionId);
    const sub = await this.adapter.pauseSubscription(subscriptionId);
    await this.store.upsertSubscription({ ...sub, tenantId: ctx.tenantId }, new Date());
    this.metrics?.increment('billing.subscription.paused', 1);
    return sub;
  }

  async resumeSubscription(ctx: Context, subscriptionId: string): Promise<Subscription> {
    await this.getSubscription(ctx, subscriptionId);
    const sub = await this.adapter.resumeSubscription(subscriptionId);
    await this.store.upsertSubscription({ ...sub, tenantId: ctx.tenantId }, new Date());
    return sub;
  }

  // ── Payments ───────────────────────────────────────────────────────────────

  async charge(
    ctx: Context,
    input: { amount: number; currency?: string; description?: string; paymentMethodId?: string; metadata?: Record<string, string>; idempotencyKey?: string },
  ): Promise<Charge> {
    const customer = await this.requireCustomer(ctx);
    const currency = (input.currency ?? this.defaultCurrency).toLowerCase();
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new BillingError('billing/invalid-input', 'amount must be a positive integer in minor units');
    }
    return withSpan(this.tracer, 'billing.charge', { amount: String(input.amount), currency }, async () => {
      try {
        const charge = await this.adapter.createCharge(
          { customerId: customer.id, amount: input.amount, currency, description: input.description, paymentMethodId: input.paymentMethodId, metadata: input.metadata },
          { idempotencyKey: resolveKey(input.idempotencyKey, 'charge') },
        );
        await this.store.upsertCharge({ ...charge, tenantId: ctx.tenantId }, new Date());
        this.metrics?.increment('billing.charge.created', 1, { currency, status: charge.status });
        this.metrics?.histogram('billing.charge.amount', input.amount, { currency });
        if (charge.status === 'succeeded') await this.onPaymentSucceeded?.(ctx, charge);
        return charge;
      } catch (error) {
        this.metrics?.increment('billing.charge.failed', 1, { currency });
        if (error instanceof BillingError) await this.onPaymentFailed?.(ctx, error);
        throw error;
      }
    });
  }

  async refund(ctx: Context, chargeId: string, options: { amount?: number; reason?: string; idempotencyKey?: string }): Promise<Refund> {
    const customer = await this.requireCustomer(ctx);
    const refund = await this.adapter.refund(chargeId, options, { idempotencyKey: resolveKey(options.idempotencyKey, 'refund') });
    await this.store.upsertRefund({ ...refund, tenantId: ctx.tenantId });
    this.logger.info({ traceId: ctx.traceId, chargeId, customerId: customer.id, amount: refund.amount }, 'Refund created');
    await this.onRefundCreated?.(ctx, refund);
    return refund;
  }

  /** Give either `priceId` (quantity defaults to 1) or `items` (omit a metered price's quantity). */
  async createCheckout(ctx: Context, input: Omit<CreateCheckoutInput, 'customerId'> & { idempotencyKey?: string }): Promise<CheckoutSession> {
    checkPrices(input, true);
    const customer = await this.requireCustomer(ctx);
    const { idempotencyKey, ...rest } = input;
    return this.adapter.createCheckoutSession({ ...rest, customerId: customer.id }, { idempotencyKey: resolveKey(idempotencyKey, 'checkout') });
  }

  async createPortal(ctx: Context, returnUrl: string): Promise<PortalSession> {
    const customer = await this.requireCustomer(ctx);
    return this.adapter.createPortalSession(customer.id, returnUrl);
  }

  async listInvoices(ctx: Context, options?: { limit?: number }): Promise<Invoice[]> {
    const customer = await this.requireCustomer(ctx);
    return this.adapter.listInvoices(customer.id, options);
  }

  /**
   * Plans from the local mirror when it has any (see `syncPlans`), else straight from the
   * provider. `lookupKeys` limits the list to those keys, and asks the provider when the mirror
   * lacks one of them. Pass `source: 'provider'` to skip the mirror.
   */
  async listPlans(
    _ctx: Context,
    options: { activeOnly?: boolean; lookupKeys?: string[]; source?: 'auto' | 'provider' } = {},
  ): Promise<Plan[]> {
    const { source, ...filter } = options;
    if (source !== 'provider') {
      const local = await this.store.listPlans(filter);
      const covered = !filter.lookupKeys || filter.lookupKeys.every((key) => local.some((p) => p.lookupKey === key));
      if (local.length > 0 && covered) return local;
    }
    return this.adapter.listPlans(filter);
  }

  /**
   * The plan whose price has `lookupKey`, from the mirror, else the provider. Includes an
   * inactive price (check `active`), preferring an active one if the mirror holds both.
   */
  async findPlanByLookupKey(_ctx: Context, lookupKey: string): Promise<Plan | null> {
    if (!lookupKey) throw invalid('lookupKey is required');
    const pick = (found: Plan[]) => found.find((p) => p.active) ?? found[0] ?? null;
    const local = pick(await this.store.listPlans({ lookupKeys: [lookupKey], activeOnly: false }));
    return local ?? pick(await this.adapter.listPlans({ lookupKeys: [lookupKey], activeOnly: false }));
  }

  /** Copies the provider's catalog into the local mirror. `price.*` webhooks keep it current after that. */
  async syncPlans(_ctx: Context): Promise<number> {
    const plans = await this.adapter.listPlans({ activeOnly: false });
    const now = new Date();
    for (const plan of plans) await this.store.upsertPlan(plan, now);
    return plans.length;
  }

  // ── Usage ─────────────────────────────────────────────────────────────────

  /**
   * Records metered usage locally (deduplicated) and forwards it to the provider. `dimensions`
   * label the record for `getUsageBreakdown` and stay local.
   */
  async reportUsage(
    ctx: Context,
    input: { metricName: string; quantity: number; idempotencyKey?: string; timestamp?: Date; dimensions?: Dimensions },
  ): Promise<boolean> {
    const tenantId = requireTenant(ctx);
    const dimensions = checkDimensions(input.dimensions);
    const customer = await this.requireCustomer(ctx);
    const timestamp = input.timestamp ?? new Date();
    const idempotencyKey = resolveKey(input.idempotencyKey, 'reportUsage');
    const fresh = await this.store.recordUsage({
      tenantId,
      customerId: customer.id,
      metricName: input.metricName,
      quantity: input.quantity,
      timestamp,
      idempotencyKey,
      dimensions,
    });
    if (!fresh) return false;
    await this.adapter.reportUsage({ customerId: customer.id, metricName: input.metricName, quantity: input.quantity, timestamp, idempotencyKey });
    this.metrics?.increment('billing.usage.reported', input.quantity, { metric: input.metricName });
    return true;
  }

  async getUsage(ctx: Context, metricName: string, range: DateRange): Promise<UsageSummary> {
    return this.store.summarizeUsage(requireTenant(ctx), metricName, range);
  }

  /** Usage of `metricName` per value of the `groupBy` dimension; records without it are grouped under `null`. */
  async getUsageBreakdown(ctx: Context, metricName: string, options: DateRange & { groupBy: string }): Promise<UsageBreakdown> {
    const groupBy = checkGroupBy(options.groupBy);
    const range = { from: options.from, to: options.to };
    const groups = await this.store.summarizeUsageByDimension(requireTenant(ctx), metricName, range, groupBy);
    return { metricName, groupBy, periodStart: range.from, periodEnd: range.to, groups };
  }

  // ── Prepaid credit ledger (local, not provider balance) ────────────────────────
  // `currency` is any 3-letter unit code (`usd`, or a unit of your own such as `mcr`), and
  // amounts are integers in that unit.

  async grantCredits(ctx: Context, amount: number, options: LedgerOptions): Promise<CreditTransaction> {
    if (!Number.isInteger(amount) || amount <= 0) throw new BillingError('billing/invalid-input', 'amount must be a positive integer');
    return this.appendLedger(ctx, amount, options);
  }

  /** Atomically consumes credits. Throws `billing/insufficient-credits` (402) when the balance is too low. */
  async consumeCredits(ctx: Context, amount: number, options: LedgerOptions & { allowNegative?: boolean }): Promise<CreditTransaction> {
    if (!Number.isInteger(amount) || amount <= 0) throw new BillingError('billing/invalid-input', 'amount must be a positive integer');
    return this.appendLedger(ctx, -amount, options, options.allowNegative);
  }

  /**
   * Appends the one entry that brings the balance to exactly `target` (any integer; a negative
   * target records a debt), atomically with concurrent consumes. Use it for allowances that
   * don't roll over: reset at each period start with a key per period, e.g.
   * `allowance:${subscription.id}:${periodStart.toISOString()}`.
   *
   * When the balance already is `target`, nothing changes (`changed: false`); with an
   * `idempotencyKey` a zero-amount entry is still recorded so a retry of the same reset later in
   * the period stays a no-op. Reusing the key returns the original entry.
   */
  async setCreditBalance(ctx: Context, target: number, options: LedgerOptions): Promise<SetCreditBalanceResult> {
    if (!Number.isInteger(target)) throw invalid('target must be an integer');
    // No generated key here: a key claims the reset even when nothing changed.
    const key = options.idempotencyKey === undefined ? null : resolveKey(options.idempotencyKey, 'setCreditBalance');
    const tx = await this.store.setCreditLedgerBalance(await this.ledgerEntry(ctx, options, key), target);
    const changed = tx !== null && tx.amount !== 0;
    if (changed) this.metrics?.increment(tx.amount > 0 ? 'billing.credits.granted' : 'billing.credits.consumed', Math.abs(tx.amount));
    return { changed, balance: tx?.balanceAfter ?? target, transaction: tx };
  }

  /**
   * Ledger entries created in `[from, to)` per value of the `groupBy` dimension: `credited` sums
   * grants (and upward resets), `debited` sums consumption (and downward resets).
   */
  async summarizeCredits(ctx: Context, options: DateRange & { groupBy: string; currency?: string }): Promise<CreditSummary> {
    const groupBy = checkGroupBy(options.groupBy);
    const tenantId = requireTenant(ctx);
    const customer = await this.requireCustomer(ctx);
    const currency = (options.currency ?? this.defaultCurrency).toLowerCase();
    const range = { from: options.from, to: options.to };
    const groups = await this.store.summarizeCreditsByDimension(tenantId, customer.id, currency, range, groupBy);
    return { currency, groupBy, periodStart: range.from, periodEnd: range.to, groups };
  }

  async getCreditBalance(ctx: Context, currency?: string): Promise<number> {
    const customer = await this.requireCustomer(ctx);
    return this.store.getCreditLedgerBalance(requireTenant(ctx), customer.id, (currency ?? this.defaultCurrency).toLowerCase());
  }

  async listCreditTransactions(ctx: Context, options?: { limit?: number }): Promise<CreditTransaction[]> {
    const customer = await this.requireCustomer(ctx);
    return this.store.listCreditTransactions(requireTenant(ctx), customer.id, options);
  }

  private async ledgerEntry(
    ctx: Context,
    options: LedgerOptions,
    idempotencyKey: string | null,
  ): Promise<Omit<CreditTransaction, 'id' | 'amount' | 'balanceAfter' | 'createdAt'>> {
    const tenantId = requireTenant(ctx);
    const dimensions = checkDimensions(options.dimensions);
    const customer = await this.requireCustomer(ctx);
    return {
      tenantId,
      customerId: customer.id,
      currency: (options.currency ?? this.defaultCurrency).toLowerCase(),
      description: options.description,
      referenceType: options.referenceType ?? null,
      referenceId: options.referenceId ?? null,
      idempotencyKey,
      dimensions,
    };
  }

  private async appendLedger(ctx: Context, amount: number, options: LedgerOptions, allowNegative = false): Promise<CreditTransaction> {
    const entry = await this.ledgerEntry(ctx, options, resolveKey(options.idempotencyKey, 'credits'));
    const tx = await this.store.appendCreditTransaction({ ...entry, amount }, { allowNegative });
    this.metrics?.increment(amount > 0 ? 'billing.credits.granted' : 'billing.credits.consumed', Math.abs(amount));
    return tx;
  }

  isHealthy(): Promise<boolean> {
    return this.adapter.isHealthy();
  }

  protected onCustomerCreated?(ctx: Context, customer: Customer): Promise<void>;
  protected onSubscriptionCreated?(ctx: Context, sub: Subscription): Promise<void>;
  protected onSubscriptionCanceled?(ctx: Context, sub: Subscription): Promise<void>;
  protected onPaymentSucceeded?(ctx: Context, charge: Charge): Promise<void>;
  protected onPaymentFailed?(ctx: Context, error: BillingError): Promise<void>;
  protected onRefundCreated?(ctx: Context, refund: Refund): Promise<void>;
}

export class DefaultBilling extends Billing {}
