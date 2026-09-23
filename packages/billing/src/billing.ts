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
  type CreditTransaction,
  type Customer,
  type DateRange,
  type Invoice,
  type Plan,
  type PortalSession,
  type Refund,
  type Subscription,
  type UpdateSubscriptionInput,
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

  /** Returns the tenant's customer, creating it on first use. Safe to call concurrently. */
  async ensureCustomer(ctx: Context, input: { email: string; name?: string; metadata?: Record<string, string> }): Promise<Customer> {
    const tenantId = requireTenant(ctx);
    return withSpan(this.tracer, 'billing.ensureCustomer', { tenantId }, async () => {
      const existing = await this.store.findCustomerByTenant(tenantId);
      if (existing) return existing;
      const customer = await this.adapter.createCustomer(
        { ...input, tenantId },
        { idempotencyKey: `mariachi:customer:${tenantId}` },
      );
      await this.store.upsertCustomer(customer, new Date());
      this.metrics?.increment('billing.customer.created', 1);
      this.logger.info({ traceId: ctx.traceId, tenantId, customerId: customer.id }, 'Billing customer created');
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

  async subscribe(
    ctx: Context,
    input: { priceId: string; quantity?: number; trialDays?: number; metadata?: Record<string, string>; idempotencyKey?: string },
  ): Promise<Subscription> {
    const customer = await this.requireCustomer(ctx);
    return withSpan(this.tracer, 'billing.subscribe', { priceId: input.priceId }, async () => {
      const current = (await this.listSubscriptions(ctx)).find((s) => ENTITLED_STATUSES.has(s.status));
      if (current) {
        throw new BillingError('billing/subscription-exists', 'Tenant already has an active subscription; use changePlan', {
          subscriptionId: current.id,
        });
      }
      const sub = await this.adapter.createSubscription(
        { customerId: customer.id, priceId: input.priceId, quantity: input.quantity, trialDays: input.trialDays, metadata: input.metadata },
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

  /** True when the tenant has an entitled subscription, optionally to one of `planIds`. */
  async hasActiveSubscription(ctx: Context, planIds?: string[]): Promise<boolean> {
    const subs = await this.listSubscriptions(ctx);
    return subs.some((s) => ENTITLED_STATUSES.has(s.status) && (!planIds || planIds.includes(s.planId)));
  }

  async changePlan(ctx: Context, subscriptionId: string, patch: UpdateSubscriptionInput & { idempotencyKey?: string }): Promise<Subscription> {
    await this.getSubscription(ctx, subscriptionId);
    const { idempotencyKey, ...rest } = patch;
    const sub = await this.adapter.updateSubscription(subscriptionId, rest, { idempotencyKey: resolveKey(idempotencyKey, 'changePlan') });
    await this.store.upsertSubscription({ ...sub, tenantId: ctx.tenantId }, new Date());
    return sub;
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

  async createCheckout(ctx: Context, input: Omit<CreateCheckoutInput, 'customerId'> & { idempotencyKey?: string }): Promise<CheckoutSession> {
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
   * provider. Pass `source: 'provider'` to skip the mirror.
   */
  async listPlans(_ctx: Context, options: { activeOnly?: boolean; source?: 'auto' | 'provider' } = {}): Promise<Plan[]> {
    if (options.source !== 'provider') {
      const local = await this.store.listPlans({ activeOnly: options.activeOnly });
      if (local.length > 0) return local;
    }
    return this.adapter.listPlans({ activeOnly: options.activeOnly });
  }

  /** Copies the provider's catalog into the local mirror. `price.*` webhooks keep it current after that. */
  async syncPlans(_ctx: Context): Promise<number> {
    const plans = await this.adapter.listPlans({ activeOnly: false });
    const now = new Date();
    for (const plan of plans) await this.store.upsertPlan(plan, now);
    return plans.length;
  }

  // ── Usage ─────────────────────────────────────────────────────────────────

  /** Records metered usage locally (deduplicated) and forwards it to the provider. */
  async reportUsage(ctx: Context, input: { metricName: string; quantity: number; idempotencyKey?: string; timestamp?: Date }): Promise<boolean> {
    const tenantId = requireTenant(ctx);
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
    });
    if (!fresh) return false;
    await this.adapter.reportUsage({ customerId: customer.id, metricName: input.metricName, quantity: input.quantity, timestamp, idempotencyKey });
    this.metrics?.increment('billing.usage.reported', input.quantity, { metric: input.metricName });
    return true;
  }

  async getUsage(ctx: Context, metricName: string, range: DateRange): Promise<UsageSummary> {
    return this.store.summarizeUsage(requireTenant(ctx), metricName, range);
  }

  // ── Prepaid credit ledger (local, not provider balance) ────────────────────────

  async grantCredits(
    ctx: Context,
    amount: number,
    options: { description: string; currency?: string; referenceType?: string; referenceId?: string; idempotencyKey?: string },
  ): Promise<CreditTransaction> {
    if (!Number.isInteger(amount) || amount <= 0) throw new BillingError('billing/invalid-input', 'amount must be a positive integer');
    return this.appendLedger(ctx, amount, options);
  }

  /** Atomically consumes credits. Throws `billing/insufficient-credits` (402) when the balance is too low. */
  async consumeCredits(
    ctx: Context,
    amount: number,
    options: { description: string; currency?: string; referenceType?: string; referenceId?: string; idempotencyKey?: string; allowNegative?: boolean },
  ): Promise<CreditTransaction> {
    if (!Number.isInteger(amount) || amount <= 0) throw new BillingError('billing/invalid-input', 'amount must be a positive integer');
    return this.appendLedger(ctx, -amount, options, options.allowNegative);
  }

  async getCreditBalance(ctx: Context, currency?: string): Promise<number> {
    const customer = await this.requireCustomer(ctx);
    return this.store.getCreditLedgerBalance(requireTenant(ctx), customer.id, (currency ?? this.defaultCurrency).toLowerCase());
  }

  async listCreditTransactions(ctx: Context, options?: { limit?: number }): Promise<CreditTransaction[]> {
    const customer = await this.requireCustomer(ctx);
    return this.store.listCreditTransactions(requireTenant(ctx), customer.id, options);
  }

  private async appendLedger(
    ctx: Context,
    amount: number,
    options: { description: string; currency?: string; referenceType?: string; referenceId?: string; idempotencyKey?: string },
    allowNegative = false,
  ): Promise<CreditTransaction> {
    const tenantId = requireTenant(ctx);
    const customer = await this.requireCustomer(ctx);
    const tx = await this.store.appendCreditTransaction(
      {
        tenantId,
        customerId: customer.id,
        amount,
        currency: (options.currency ?? this.defaultCurrency).toLowerCase(),
        description: options.description,
        referenceType: options.referenceType ?? null,
        referenceId: options.referenceId ?? null,
        idempotencyKey: resolveKey(options.idempotencyKey, 'credits'),
      },
      { allowNegative },
    );
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
