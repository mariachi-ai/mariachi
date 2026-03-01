import type { BillingAdapter, Subscription } from '../types';

export interface SubscriptionServiceConfig {
  adapter: BillingAdapter;
  onSubscriptionCreated?: (subscription: Subscription) => Promise<void>;
  onSubscriptionCanceled?: (subscription: Subscription) => Promise<void>;
}

export class SubscriptionService {
  constructor(private config: SubscriptionServiceConfig) {}

  async createSubscription(
    customerId: string,
    planId: string,
    idempotencyKey?: string
  ): Promise<Subscription> {
    const existing = await this.findActiveSubscription(customerId);
    if (existing) {
      return existing;
    }
    const subscription = await this.config.adapter.createSubscription(
      customerId,
      planId,
      idempotencyKey
    );
    if (this.config.onSubscriptionCreated) {
      await this.config.onSubscriptionCreated(subscription);
    }
    return subscription;
  }

  async cancelSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription = await this.config.adapter.cancelSubscription(subscriptionId);
    if (this.config.onSubscriptionCanceled) {
      await this.config.onSubscriptionCanceled(subscription);
    }
    return subscription;
  }

  async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    return this.config.adapter.getSubscription(subscriptionId);
  }

  private async findActiveSubscription(customerId: string): Promise<Subscription | null> {
    const subscriptions = await this.config.adapter.listSubscriptions(customerId);
    return subscriptions.find((s) => s.status === 'active') ?? null;
  }
}
