import Stripe from 'stripe';
import { BillingError } from '@mariachi/core';
import type {
  BillingAdapter,
  Charge,
  CheckoutSession,
  CreateChargeInput,
  CreateCheckoutInput,
  CreateCustomerInput,
  CreateSubscriptionInput,
  CreditBalance,
  Customer,
  IdempotencyOptions,
  Invoice,
  Plan,
  PortalSession,
  ProviderEvent,
  Refund,
  Subscription,
  UpdateSubscriptionInput,
} from '../types';
import { mapCustomer, mapInvoice, mapPaymentIntent, mapPrice, mapRefund, mapSubscription } from './stripe-mappers';

export interface StripeAdapterConfig {
  secretKey: string;
  apiVersion?: string;
  maxNetworkRetries?: number;
  timeoutMs?: number;
  /** Tolerance for webhook timestamps, seconds. Default 300. */
  webhookToleranceSeconds?: number;
  /** Pre-built client (tests). */
  client?: Stripe;
}

function isMissing(err: unknown): boolean {
  return err instanceof Stripe.errors.StripeError && (err.code === 'resource_missing' || err.statusCode === 404);
}

/** Maps Stripe SDK errors to typed billing errors with HTTP-meaningful codes. */
export function mapStripeError(err: unknown, operation: string): BillingError {
  if (err instanceof BillingError) return err;
  if (!(err instanceof Stripe.errors.StripeError)) {
    return new BillingError('billing/upstream-failed', `${operation} failed`, { cause: String(err) });
  }
  const meta = { operation, stripeCode: err.code, declineCode: (err as { decline_code?: string }).decline_code, requestId: err.requestId };
  switch (err.type) {
    case 'StripeCardError':
      return new BillingError('billing/payment-failed', err.message, meta);
    case 'StripeInvalidRequestError':
      return err.code === 'resource_missing'
        ? new BillingError('billing/not-found', err.message, meta)
        : new BillingError('billing/invalid-input', err.message, meta);
    case 'StripeIdempotencyError':
      return new BillingError('billing/idempotency-conflict', err.message, meta);
    case 'StripeRateLimitError':
      return new BillingError('billing/rate-limited', err.message, meta);
    case 'StripeAuthenticationError':
    case 'StripePermissionError':
      return new BillingError('billing/config', 'Stripe rejected the API credentials', meta);
    default:
      return new BillingError('billing/upstream-failed', err.message, meta);
  }
}

export class StripeAdapter implements BillingAdapter {
  readonly name = 'stripe';
  private readonly stripe: Stripe;
  private readonly tolerance: number;

  constructor(config: StripeAdapterConfig) {
    if (!config.client && !config.secretKey) {
      throw new BillingError('billing/config', 'Stripe adapter requires secretKey');
    }
    this.stripe =
      config.client ??
      new Stripe(config.secretKey, {
        apiVersion: config.apiVersion as Stripe.LatestApiVersion | undefined,
        maxNetworkRetries: config.maxNetworkRetries ?? 2,
        timeout: config.timeoutMs ?? 20_000,
        appInfo: { name: 'mariachi' },
      });
    this.tolerance = config.webhookToleranceSeconds ?? 300;
  }

  /** Escape hatch for provider features not covered by the port. */
  get client(): Stripe {
    return this.stripe;
  }

  private async call<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw mapStripeError(err, operation);
    }
  }

  async createCustomer(input: CreateCustomerInput, opts: IdempotencyOptions = {}): Promise<Customer> {
    return this.call('createCustomer', async () =>
      mapCustomer(
        await this.stripe.customers.create(
          { email: input.email, name: input.name, metadata: { ...input.metadata, tenantId: input.tenantId } },
          { idempotencyKey: opts.idempotencyKey },
        ),
      ),
    );
  }

  async getCustomer(id: string): Promise<Customer | null> {
    try {
      const customer = await this.stripe.customers.retrieve(id);
      return customer.deleted ? null : mapCustomer(customer);
    } catch (err) {
      if (isMissing(err)) return null;
      throw mapStripeError(err, 'getCustomer');
    }
  }

  async updateCustomer(id: string, patch: { email?: string; name?: string; metadata?: Record<string, string> }): Promise<Customer> {
    return this.call('updateCustomer', async () => mapCustomer(await this.stripe.customers.update(id, patch)));
  }

  async createSubscription(input: CreateSubscriptionInput, opts: IdempotencyOptions = {}): Promise<Subscription> {
    return this.call('createSubscription', async () => {
      const customer = await this.stripe.customers.retrieve(input.customerId);
      const tenantId = customer.deleted ? undefined : customer.metadata?.tenantId;
      const sub = await this.stripe.subscriptions.create(
        {
          customer: input.customerId,
          items: [{ price: input.priceId, quantity: input.quantity }],
          trial_period_days: input.trialDays,
          metadata: { ...input.metadata, ...(tenantId ? { tenantId } : {}) },
          payment_behavior: 'default_incomplete',
          expand: ['latest_invoice.payment_intent'],
        },
        { idempotencyKey: opts.idempotencyKey },
      );
      return mapSubscription(sub);
    });
  }

  async updateSubscription(id: string, patch: UpdateSubscriptionInput, opts: IdempotencyOptions = {}): Promise<Subscription> {
    return this.call('updateSubscription', async () => {
      const current = await this.stripe.subscriptions.retrieve(id);
      const item = current.items.data[0];
      const sub = await this.stripe.subscriptions.update(
        id,
        {
          items:
            patch.priceId || patch.quantity !== undefined
              ? [{ id: item?.id, price: patch.priceId, quantity: patch.quantity }]
              : undefined,
          proration_behavior: patch.prorationBehavior,
          metadata: patch.metadata,
        },
        { idempotencyKey: opts.idempotencyKey },
      );
      return mapSubscription(sub);
    });
  }

  async cancelSubscription(id: string, options: { atPeriodEnd?: boolean } = {}): Promise<Subscription> {
    return this.call('cancelSubscription', async () =>
      mapSubscription(
        options.atPeriodEnd
          ? await this.stripe.subscriptions.update(id, { cancel_at_period_end: true })
          : await this.stripe.subscriptions.cancel(id),
      ),
    );
  }

  async pauseSubscription(id: string): Promise<Subscription> {
    return this.call('pauseSubscription', async () =>
      mapSubscription(await this.stripe.subscriptions.update(id, { pause_collection: { behavior: 'mark_uncollectible' } })),
    );
  }

  async resumeSubscription(id: string): Promise<Subscription> {
    return this.call('resumeSubscription', async () =>
      mapSubscription(
        await this.stripe.subscriptions.update(id, {
          cancel_at_period_end: false,
          pause_collection: '',
        }),
      ),
    );
  }

  async getSubscription(id: string): Promise<Subscription | null> {
    try {
      return mapSubscription(await this.stripe.subscriptions.retrieve(id));
    } catch (err) {
      if (isMissing(err)) return null;
      throw mapStripeError(err, 'getSubscription');
    }
  }

  async listSubscriptions(customerId: string): Promise<Subscription[]> {
    return this.call('listSubscriptions', async () => {
      const out: Subscription[] = [];
      for await (const s of this.stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 })) {
        out.push(mapSubscription(s));
      }
      return out;
    });
  }

  async createCharge(input: CreateChargeInput, opts: IdempotencyOptions = {}): Promise<Charge> {
    return this.call('createCharge', async () => {
      const customer = await this.stripe.customers.retrieve(input.customerId);
      const tenantId = customer.deleted ? undefined : customer.metadata?.tenantId;
      const pi = await this.stripe.paymentIntents.create(
        {
          customer: input.customerId,
          amount: Math.round(input.amount),
          currency: input.currency.toLowerCase(),
          description: input.description,
          payment_method: input.paymentMethodId,
          confirm: Boolean(input.paymentMethodId),
          off_session: input.paymentMethodId ? true : undefined,
          metadata: { ...input.metadata, ...(tenantId ? { tenantId } : {}) },
        },
        { idempotencyKey: opts.idempotencyKey },
      );
      return mapPaymentIntent(pi);
    });
  }

  async refund(chargeId: string, options: { amount?: number; reason?: string } = {}, opts: IdempotencyOptions = {}): Promise<Refund> {
    return this.call('refund', async () => {
      const target = chargeId.startsWith('pi_') ? { payment_intent: chargeId } : { charge: chargeId };
      const refund = await this.stripe.refunds.create(
        {
          ...target,
          amount: options.amount,
          reason: options.reason as Stripe.RefundCreateParams.Reason | undefined,
        },
        { idempotencyKey: opts.idempotencyKey },
      );
      return mapRefund(refund, chargeId);
    });
  }

  async createCheckoutSession(input: CreateCheckoutInput, opts: IdempotencyOptions = {}): Promise<CheckoutSession> {
    return this.call('createCheckoutSession', async () => {
      const customer = await this.stripe.customers.retrieve(input.customerId);
      const tenantId = customer.deleted ? undefined : customer.metadata?.tenantId;
      const metadata = { ...input.metadata, ...(tenantId ? { tenantId } : {}) };
      const session = await this.stripe.checkout.sessions.create(
        {
          customer: input.customerId,
          mode: input.mode,
          line_items: [{ price: input.priceId, quantity: input.quantity ?? 1 }],
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          allow_promotion_codes: input.allowPromotionCodes,
          metadata,
          subscription_data: input.mode === 'subscription' ? { trial_period_days: input.trialDays, metadata } : undefined,
          payment_intent_data: input.mode === 'payment' ? { metadata } : undefined,
        },
        { idempotencyKey: opts.idempotencyKey },
      );
      if (!session.url) throw new BillingError('billing/upstream-failed', 'Stripe returned a checkout session without a URL');
      return { id: session.id, url: session.url };
    });
  }

  async createPortalSession(customerId: string, returnUrl: string): Promise<PortalSession> {
    return this.call('createPortalSession', async () => {
      const session = await this.stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
      return { url: session.url };
    });
  }

  async listInvoices(customerId: string, options: { limit?: number } = {}): Promise<Invoice[]> {
    return this.call('listInvoices', async () => {
      const result = await this.stripe.invoices.list({ customer: customerId, limit: Math.min(options.limit ?? 24, 100) });
      return result.data.map(mapInvoice);
    });
  }

  async listPlans(options: { activeOnly?: boolean } = {}): Promise<Plan[]> {
    return this.call('listPlans', async () => {
      const out: Plan[] = [];
      for await (const p of this.stripe.prices.list({ active: options.activeOnly ?? true, limit: 100, expand: ['data.product'] })) {
        out.push(mapPrice(p));
      }
      return out;
    });
  }

  async reportUsage(input: { customerId: string; metricName: string; quantity: number; timestamp: Date; idempotencyKey?: string }): Promise<void> {
    await this.call('reportUsage', () =>
      this.stripe.billing.meterEvents.create({
        event_name: input.metricName,
        identifier: input.idempotencyKey,
        timestamp: Math.floor(input.timestamp.getTime() / 1000),
        payload: { stripe_customer_id: input.customerId, value: String(input.quantity) },
      }),
    );
  }

  async getCreditBalance(customerId: string, currency?: string): Promise<CreditBalance> {
    return this.call('getCreditBalance', async () => {
      const customer = await this.stripe.customers.retrieve(customerId, { expand: ['invoice_credit_balance'] });
      if (customer.deleted) throw new BillingError('billing/not-found', `Customer ${customerId} was deleted`);
      const cur = (currency ?? customer.currency ?? 'usd').toLowerCase();
      // Stripe balances are negative for credit; invoice_credit_balance is positive for credit.
      const multi = customer.invoice_credit_balance?.[cur];
      const balance =
        multi !== undefined ? multi : !customer.currency || customer.currency === cur ? -(customer.balance ?? 0) : 0;
      return { customerId, balance, currency: cur };
    });
  }

  async adjustCreditBalance(customerId: string, amount: number, currency: string, description?: string, opts: IdempotencyOptions = {}): Promise<CreditBalance> {
    await this.call('adjustCreditBalance', () =>
      this.stripe.customers.createBalanceTransaction(
        customerId,
        { amount: -Math.round(amount), currency: currency.toLowerCase(), description },
        { idempotencyKey: opts.idempotencyKey },
      ),
    );
    return this.getCreditBalance(customerId, currency);
  }

  async parseWebhook(rawBody: Buffer | string, signature: string, secret: string): Promise<ProviderEvent> {
    let event: Stripe.Event;
    try {
      event = await this.stripe.webhooks.constructEventAsync(rawBody, signature, secret, this.tolerance);
    } catch (err) {
      throw new BillingError('billing/webhook-invalid-signature', 'Stripe webhook signature verification failed', {
        reason: (err as Error).message,
      });
    }
    return {
      id: event.id,
      type: event.type,
      createdAt: new Date(event.created * 1000),
      object: event.data.object as unknown as Record<string, unknown>,
      previousAttributes: event.data.previous_attributes as Record<string, unknown> | undefined,
      livemode: event.livemode,
    };
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.stripe.balance.retrieve();
      return true;
    } catch {
      return false;
    }
  }
}
