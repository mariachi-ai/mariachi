import { createHmac, timingSafeEqual } from 'node:crypto';
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

/**
 * In-memory provider with Stripe-compatible webhook signatures
 * (`t=<unix>,v1=<hmac-sha256(t.body)>`). For tests and local development.
 */
export class MemoryBillingAdapter implements BillingAdapter {
  readonly name = 'memory';
  readonly customers = new Map<string, Customer>();
  readonly subscriptions = new Map<string, Subscription>();
  readonly charges = new Map<string, Charge>();
  readonly usage: Array<{ customerId: string; metricName: string; quantity: number; timestamp: Date; idempotencyKey?: string }> = [];
  readonly plans: Plan[] = [];
  private readonly balances = new Map<string, number>();
  private readonly idempotent = new Map<string, unknown>();
  private seq = 0;

  constructor(private readonly toleranceSeconds = 300) {}

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_mem${String(this.seq).padStart(6, '0')}`;
  }

  private once<T>(opts: IdempotencyOptions | undefined, fn: () => T): T {
    if (!opts?.idempotencyKey) return fn();
    if (this.idempotent.has(opts.idempotencyKey)) return this.idempotent.get(opts.idempotencyKey) as T;
    const result = fn();
    this.idempotent.set(opts.idempotencyKey, result);
    return result;
  }

  private requireCustomer(id: string): Customer {
    const c = this.customers.get(id);
    if (!c) throw new BillingError('billing/not-found', `No such customer: ${id}`);
    return c;
  }

  private requireSubscription(id: string): Subscription {
    const s = this.subscriptions.get(id);
    if (!s) throw new BillingError('billing/not-found', `No such subscription: ${id}`);
    return s;
  }

  async createCustomer(input: CreateCustomerInput, opts?: IdempotencyOptions): Promise<Customer> {
    return this.once(opts, () => {
      const customer: Customer = {
        id: this.nextId('cus'),
        email: input.email,
        name: input.name ?? null,
        tenantId: input.tenantId,
        delinquent: false,
        metadata: { ...input.metadata, tenantId: input.tenantId },
      };
      this.customers.set(customer.id, customer);
      return customer;
    });
  }

  async getCustomer(id: string): Promise<Customer | null> {
    return this.customers.get(id) ?? null;
  }

  async updateCustomer(id: string, patch: { email?: string; name?: string; metadata?: Record<string, string> }): Promise<Customer> {
    const c = this.requireCustomer(id);
    const next = { ...c, ...patch, metadata: { ...c.metadata, ...patch.metadata } } as Customer;
    this.customers.set(id, next);
    return next;
  }

  async createSubscription(input: CreateSubscriptionInput, opts?: IdempotencyOptions): Promise<Subscription> {
    return this.once(opts, () => {
      const customer = this.requireCustomer(input.customerId);
      const now = Date.now();
      const sub: Subscription = {
        id: this.nextId('sub'),
        customerId: input.customerId,
        tenantId: customer.tenantId,
        planId: input.priceId,
        quantity: input.quantity ?? 1,
        status: input.trialDays ? 'trialing' : 'active',
        currentPeriodStart: new Date(now),
        currentPeriodEnd: new Date(now + 30 * 86_400_000),
        cancelAtPeriodEnd: false,
        cancelAt: null,
        canceledAt: null,
        trialEnd: input.trialDays ? new Date(now + input.trialDays * 86_400_000) : null,
        metadata: { ...input.metadata, ...(customer.tenantId ? { tenantId: customer.tenantId } : {}) },
      };
      this.subscriptions.set(sub.id, sub);
      return sub;
    });
  }

  async updateSubscription(id: string, patch: UpdateSubscriptionInput): Promise<Subscription> {
    const s = this.requireSubscription(id);
    const next: Subscription = {
      ...s,
      planId: patch.priceId ?? s.planId,
      quantity: patch.quantity ?? s.quantity,
      metadata: { ...s.metadata, ...patch.metadata },
    };
    this.subscriptions.set(id, next);
    return next;
  }

  async cancelSubscription(id: string, options: { atPeriodEnd?: boolean } = {}): Promise<Subscription> {
    const s = this.requireSubscription(id);
    const next: Subscription = options.atPeriodEnd
      ? { ...s, cancelAtPeriodEnd: true, cancelAt: s.currentPeriodEnd }
      : { ...s, status: 'canceled', canceledAt: new Date() };
    this.subscriptions.set(id, next);
    return next;
  }

  async pauseSubscription(id: string): Promise<Subscription> {
    const s = this.requireSubscription(id);
    const next: Subscription = { ...s, status: 'paused' };
    this.subscriptions.set(id, next);
    return next;
  }

  async resumeSubscription(id: string): Promise<Subscription> {
    const s = this.requireSubscription(id);
    const next: Subscription = { ...s, status: s.status === 'paused' ? 'active' : s.status, cancelAtPeriodEnd: false, cancelAt: null };
    this.subscriptions.set(id, next);
    return next;
  }

  async getSubscription(id: string): Promise<Subscription | null> {
    return this.subscriptions.get(id) ?? null;
  }

  async listSubscriptions(customerId: string): Promise<Subscription[]> {
    return [...this.subscriptions.values()].filter((s) => s.customerId === customerId);
  }

  async createCharge(input: CreateChargeInput, opts?: IdempotencyOptions): Promise<Charge> {
    return this.once(opts, () => {
      const customer = this.requireCustomer(input.customerId);
      if (input.amount <= 0) throw new BillingError('billing/invalid-input', 'Amount must be positive');
      const charge: Charge = {
        id: this.nextId('pi'),
        customerId: input.customerId,
        tenantId: customer.tenantId,
        amount: Math.round(input.amount),
        amountRefunded: 0,
        currency: input.currency.toLowerCase(),
        status: input.paymentMethodId === 'pm_card_declined' ? 'failed' : 'succeeded',
        description: input.description ?? null,
        failureCode: input.paymentMethodId === 'pm_card_declined' ? 'card_declined' : null,
        failureReason: input.paymentMethodId === 'pm_card_declined' ? 'Your card was declined.' : null,
        invoiceId: null,
        metadata: input.metadata ?? {},
      };
      this.charges.set(charge.id, charge);
      if (charge.status === 'failed') {
        throw new BillingError('billing/payment-failed', charge.failureReason!, { declineCode: 'card_declined' });
      }
      return charge;
    });
  }

  async refund(chargeId: string, options: { amount?: number; reason?: string } = {}, opts?: IdempotencyOptions): Promise<Refund> {
    return this.once(opts, () => {
      const charge = this.charges.get(chargeId);
      if (!charge) throw new BillingError('billing/not-found', `No such charge: ${chargeId}`);
      const amount = options.amount ?? charge.amount - charge.amountRefunded;
      if (amount <= 0 || charge.amountRefunded + amount > charge.amount) {
        throw new BillingError('billing/invalid-input', 'Refund exceeds the refundable amount');
      }
      this.charges.set(chargeId, { ...charge, amountRefunded: charge.amountRefunded + amount });
      return {
        id: this.nextId('re'),
        chargeId,
        tenantId: charge.tenantId,
        amount,
        currency: charge.currency,
        reason: options.reason ?? null,
        status: 'succeeded',
      };
    });
  }

  async createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession> {
    this.requireCustomer(input.customerId);
    const id = this.nextId('cs');
    return { id, url: `https://checkout.memory.local/${id}` };
  }

  async createPortalSession(customerId: string, returnUrl: string): Promise<PortalSession> {
    this.requireCustomer(customerId);
    return { url: `https://billing.memory.local/${customerId}?return=${encodeURIComponent(returnUrl)}` };
  }

  async listInvoices(): Promise<Invoice[]> {
    return [];
  }

  async listPlans(options: { activeOnly?: boolean } = {}): Promise<Plan[]> {
    return options.activeOnly === false ? [...this.plans] : this.plans.filter((p) => p.active);
  }

  async reportUsage(input: { customerId: string; metricName: string; quantity: number; timestamp: Date; idempotencyKey?: string }): Promise<void> {
    if (input.idempotencyKey && this.usage.some((u) => u.idempotencyKey === input.idempotencyKey)) return;
    this.usage.push(input);
  }

  async getCreditBalance(customerId: string, currency = 'usd'): Promise<CreditBalance> {
    this.requireCustomer(customerId);
    return { customerId, balance: this.balances.get(`${customerId}:${currency.toLowerCase()}`) ?? 0, currency: currency.toLowerCase() };
  }

  async adjustCreditBalance(customerId: string, amount: number, currency: string, _description?: string, opts?: IdempotencyOptions): Promise<CreditBalance> {
    this.once(opts, () => {
      const key = `${customerId}:${currency.toLowerCase()}`;
      this.balances.set(key, (this.balances.get(key) ?? 0) + Math.round(amount));
    });
    return this.getCreditBalance(customerId, currency);
  }

  /** Signs a payload the way Stripe does, for tests. */
  static sign(body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
    const sig = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
    return `t=${timestamp},v1=${sig}`;
  }

  async parseWebhook(rawBody: Buffer | string, signature: string, secret: string): Promise<ProviderEvent> {
    const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const parts = Object.fromEntries(signature.split(',').map((p) => p.split('=') as [string, string]));
    const t = Number(parts.t);
    const expected = Buffer.from(createHmac('sha256', secret).update(`${parts.t}.${body}`).digest('hex'));
    const actual = Buffer.from(parts.v1 ?? '');
    const fresh = Number.isFinite(t) && Math.abs(Date.now() / 1000 - t) <= this.toleranceSeconds;
    if (!fresh || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new BillingError('billing/webhook-invalid-signature', 'Webhook signature verification failed');
    }
    let event: { id: string; type: string; created: number; livemode?: boolean; data: { object: Record<string, unknown>; previous_attributes?: Record<string, unknown> } };
    try {
      event = JSON.parse(body);
    } catch {
      throw new BillingError('billing/invalid-input', 'Webhook body is not valid JSON');
    }
    return {
      id: event.id,
      type: event.type,
      createdAt: new Date(event.created * 1000),
      object: event.data.object,
      previousAttributes: event.data.previous_attributes,
      livemode: Boolean(event.livemode),
    };
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}
