import Stripe from 'stripe';
import { BillingError } from '@mariachi/core';
import type {
  BillingAdapter,
  Customer,
  Subscription,
  Charge,
  CreditBalance,
} from '../types';

const SUBSCRIPTION_STATUS_MAP: Record<string, Subscription['status']> = {
  active: 'active',
  canceled: 'canceled',
  past_due: 'past_due',
  trialing: 'trialing',
  unpaid: 'past_due',
  incomplete: 'past_due',
  incomplete_expired: 'canceled',
};

const CHARGE_STATUS_MAP: Record<string, Charge['status']> = {
  succeeded: 'succeeded',
  failed: 'failed',
  pending: 'pending',
};

export class StripeAdapter implements BillingAdapter {
  private stripe: Stripe;

  constructor(config: { secretKey: string }) {
    this.stripe = new Stripe(config.secretKey);
  }

  async createCustomer(email: string, metadata?: Record<string, string>): Promise<Customer> {
    try {
      const customer = await this.stripe.customers.create({
        email,
        metadata: metadata ?? {},
      });
      return this.mapCustomer(customer);
    } catch (err) {
      throw new BillingError('billing/create-customer-failed', 'Failed to create customer', { cause: err });
    }
  }

  async getCustomer(externalId: string): Promise<Customer | null> {
    try {
      const customer = await this.stripe.customers.retrieve(externalId);
      if (customer.deleted) return null;
      return this.mapCustomer(customer);
    } catch (err) {
      if (err instanceof Stripe.errors.StripeError && err.code === 'resource_missing_not_found') {
        return null;
      }
      throw new BillingError('billing/get-customer-failed', 'Failed to get customer', { cause: err });
    }
  }

  async createSubscription(
    customerId: string,
    planId: string,
    idempotencyKey?: string
  ): Promise<Subscription> {
    try {
      const options: Stripe.SubscriptionCreateParams = {
        customer: customerId,
        items: [{ price: planId }],
      };
      const subscription = await this.stripe.subscriptions.create(options, {
        idempotencyKey,
      });
      return this.mapSubscription(subscription);
    } catch (err) {
      throw new BillingError('billing/create-subscription-failed', 'Failed to create subscription', { cause: err });
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.cancel(subscriptionId);
      return this.mapSubscription(subscription);
    } catch (err) {
      throw new BillingError('billing/cancel-subscription-failed', 'Failed to cancel subscription', { cause: err });
    }
  }

  async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      return this.mapSubscription(subscription);
    } catch (err) {
      if (err instanceof Stripe.errors.StripeError && err.code === 'resource_missing_not_found') {
        return null;
      }
      throw new BillingError('billing/get-subscription-failed', 'Failed to get subscription', { cause: err });
    }
  }

  async listSubscriptions(customerId: string): Promise<Subscription[]> {
    try {
      const result = await this.stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
      });
      return result.data.map((s) => this.mapSubscription(s));
    } catch (err) {
      throw new BillingError('billing/list-subscriptions-failed', 'Failed to list subscriptions', { cause: err });
    }
  }

  async createCharge(
    customerId: string,
    amount: number,
    currency: string,
    idempotencyKey?: string
  ): Promise<Charge> {
    try {
      const options: Stripe.ChargeCreateParams = {
        customer: customerId,
        amount: Math.round(amount),
        currency: currency.toLowerCase(),
      };
      const charge = await this.stripe.charges.create(options, {
        idempotencyKey,
      });
      return this.mapCharge(charge);
    } catch (err) {
      throw new BillingError('billing/create-charge-failed', 'Failed to create charge', { cause: err });
    }
  }

  async getCredits(customerId: string): Promise<CreditBalance> {
    try {
      const customer = await this.stripe.customers.retrieve(customerId);
      if (customer.deleted) {
        return { customerId, balance: 0, currency: 'usd' };
      }
      const balance =
        'invoice_credit_balance' in customer && customer.invoice_credit_balance
          ? customer.invoice_credit_balance.amount
          : (customer as Stripe.Customer).balance ?? 0;
      const currency =
        'invoice_credit_balance' in customer && customer.invoice_credit_balance
          ? customer.invoice_credit_balance.currency
          : (customer as Stripe.Customer).currency ?? 'usd';
      return { customerId, balance: Math.abs(balance), currency: String(currency) };
    } catch (err) {
      throw new BillingError('billing/get-credits-failed', 'Failed to get credits', { cause: err });
    }
  }

  async addCredits(customerId: string, amount: number, currency: string): Promise<CreditBalance> {
    try {
      await this.stripe.customers.createBalanceTransaction(customerId, {
        amount: -Math.round(amount),
        currency: currency.toLowerCase(),
      });
      return this.getCredits(customerId);
    } catch (err) {
      throw new BillingError('billing/add-credits-failed', 'Failed to add credits', { cause: err });
    }
  }

  private mapCustomer(c: Stripe.Customer): Customer {
    const tenantId = (c.metadata?.tenantId as string) ?? '';
    return {
      id: c.id,
      externalId: c.id,
      email: c.email ?? '',
      tenantId,
    };
  }

  private mapSubscription(s: Stripe.Subscription): Subscription {
    const planId =
      s.items.data[0]?.price?.id ?? (typeof s.items.data[0]?.price === 'string' ? s.items.data[0].price : '');
    const status = SUBSCRIPTION_STATUS_MAP[s.status] ?? 'canceled';
    return {
      id: s.id,
      customerId: typeof s.customer === 'string' ? s.customer : s.customer.id,
      planId,
      status,
      currentPeriodEnd: new Date((s.current_period_end ?? 0) * 1000),
    };
  }

  private mapCharge(c: Stripe.Charge): Charge {
    const customerId = typeof c.customer === 'string' ? c.customer : c.customer?.id ?? '';
    const status = CHARGE_STATUS_MAP[c.status] ?? 'pending';
    return {
      id: c.id,
      customerId,
      amount: c.amount,
      currency: String(c.currency),
      status,
    };
  }
}
