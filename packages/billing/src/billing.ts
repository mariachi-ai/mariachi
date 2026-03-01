import type { Context, Logger, Instrumentable } from '@mariachi/core';
import { withSpan, getContainer, KEYS, BillingError } from '@mariachi/core';
import type { TracerAdapter, MetricsAdapter } from '@mariachi/core';
import type {
  BillingAdapter,
  Customer,
  Subscription,
  Charge,
  Refund,
  CreditBalance,
  WebhookEvent,
} from './types';

export interface BillingConfig {
  adapter: BillingAdapter;
  webhookSecret?: string;
}

export abstract class Billing implements Instrumentable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly adapter: BillingAdapter;
  protected readonly webhookSecret?: string;

  constructor(config: BillingConfig) {
    const container = getContainer();
    this.logger = container.resolve<Logger>(KEYS.Logger);
    this.tracer = container.has(KEYS.Tracer) ? container.resolve<TracerAdapter>(KEYS.Tracer) : undefined;
    this.metrics = container.has(KEYS.Metrics) ? container.resolve<MetricsAdapter>(KEYS.Metrics) : undefined;
    this.adapter = config.adapter;
    this.webhookSecret = config.webhookSecret;
  }

  async createCustomer(ctx: Context, email: string, metadata?: Record<string, string>): Promise<Customer> {
    return withSpan(this.tracer, 'billing.createCustomer', { email }, async () => {
      this.logger.info({ traceId: ctx.traceId, email }, 'Creating billing customer');
      try {
        const customer = await this.adapter.createCustomer(email, metadata);
        this.metrics?.increment('billing.customer.created', 1);
        await this.onCustomerCreated?.(ctx, customer);
        return customer;
      } catch (error) {
        this.metrics?.increment('billing.customer.create_failed', 1);
        throw error instanceof BillingError ? error : new BillingError('billing/create-customer-failed', (error as Error).message);
      }
    });
  }

  async createSubscription(ctx: Context, customerId: string, planId: string, idempotencyKey?: string): Promise<Subscription> {
    return withSpan(this.tracer, 'billing.createSubscription', { customerId, planId }, async () => {
      this.logger.info({ traceId: ctx.traceId, customerId, planId }, 'Creating subscription');
      const existing = await this.adapter.listSubscriptions(customerId);
      const active = existing.find(s => s.status === 'active');
      if (active) {
        this.logger.info({ traceId: ctx.traceId, existingSubId: active.id }, 'Active subscription exists, returning existing');
        return active;
      }
      try {
        const sub = await this.adapter.createSubscription(customerId, planId, idempotencyKey);
        this.metrics?.increment('billing.subscription.created', 1);
        await this.onSubscriptionCreated?.(ctx, sub);
        return sub;
      } catch (error) {
        this.metrics?.increment('billing.subscription.create_failed', 1);
        throw error instanceof BillingError ? error : new BillingError('billing/create-subscription-failed', (error as Error).message);
      }
    });
  }

  async cancelSubscription(ctx: Context, subscriptionId: string, reason?: string): Promise<Subscription> {
    return withSpan(this.tracer, 'billing.cancelSubscription', { subscriptionId }, async () => {
      this.logger.info({ traceId: ctx.traceId, subscriptionId, reason }, 'Canceling subscription');
      const sub = await this.adapter.cancelSubscription(subscriptionId);
      this.metrics?.increment('billing.subscription.canceled', 1);
      await this.onSubscriptionCanceled?.(ctx, sub);
      return sub;
    });
  }

  async getSubscription(ctx: Context, subscriptionId: string): Promise<Subscription | null> {
    return withSpan(this.tracer, 'billing.getSubscription', { subscriptionId }, async () => {
      return this.adapter.getSubscription(subscriptionId);
    });
  }

  async createCharge(ctx: Context, customerId: string, amount: number, currency: string, idempotencyKey?: string): Promise<Charge> {
    return withSpan(this.tracer, 'billing.createCharge', { customerId, amount: amount.toString(), currency }, async () => {
      this.logger.info({ traceId: ctx.traceId, customerId, amount, currency }, 'Creating charge');
      try {
        const charge = await this.adapter.createCharge(customerId, amount, currency, idempotencyKey);
        this.metrics?.increment('billing.charge.succeeded', 1, { currency });
        this.metrics?.histogram('billing.charge.amount', amount, { currency });
        await this.onPaymentSucceeded?.(ctx, charge);
        return charge;
      } catch (error) {
        this.metrics?.increment('billing.charge.failed', 1, { currency });
        await this.onPaymentFailed?.(ctx, error as Error);
        throw error instanceof BillingError ? error : new BillingError('billing/charge-failed', (error as Error).message);
      }
    });
  }

  async getCredits(ctx: Context, customerId: string): Promise<CreditBalance> {
    return withSpan(this.tracer, 'billing.getCredits', { customerId }, async () => {
      return this.adapter.getCredits(customerId);
    });
  }

  async addCredits(ctx: Context, customerId: string, amount: number, currency: string): Promise<CreditBalance> {
    return withSpan(this.tracer, 'billing.addCredits', { customerId, amount: amount.toString() }, async () => {
      this.logger.info({ traceId: ctx.traceId, customerId, amount, currency }, 'Adding credits');
      const balance = await this.adapter.addCredits(customerId, amount, currency);
      this.metrics?.increment('billing.credit.added', 1, { currency });
      return balance;
    });
  }

  protected onCustomerCreated?(ctx: Context, customer: Customer): Promise<void>;
  protected onSubscriptionCreated?(ctx: Context, sub: Subscription): Promise<void>;
  protected onSubscriptionCanceled?(ctx: Context, sub: Subscription): Promise<void>;
  protected onSubscriptionPastDue?(ctx: Context, sub: Subscription): Promise<void>;
  protected onPaymentSucceeded?(ctx: Context, charge: Charge): Promise<void>;
  protected onPaymentFailed?(ctx: Context, error: Error): Promise<void>;
  protected onRefundCreated?(ctx: Context, refund: Refund): Promise<void>;
}

export class DefaultBilling extends Billing {}
