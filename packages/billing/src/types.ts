export interface BillingConfig {
  adapter: string;
  secretKey?: string;
  webhookSecret?: string;
}

export interface Customer {
  id: string;
  externalId: string;
  email: string;
  tenantId: string;
}

export interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  currentPeriodEnd: Date;
}

export interface Charge {
  id: string;
  customerId: string;
  amount: number;
  currency: string;
  status: 'succeeded' | 'failed' | 'pending';
}

export interface CreditBalance {
  customerId: string;
  balance: number;
  currency: string;
}

export interface BillingAdapter {
  createCustomer(email: string, metadata?: Record<string, string>): Promise<Customer>;
  getCustomer(externalId: string): Promise<Customer | null>;
  createSubscription(customerId: string, planId: string, idempotencyKey?: string): Promise<Subscription>;
  cancelSubscription(subscriptionId: string): Promise<Subscription>;
  getSubscription(subscriptionId: string): Promise<Subscription | null>;
  listSubscriptions(customerId: string): Promise<Subscription[]>;
  createCharge(customerId: string, amount: number, currency: string, idempotencyKey?: string): Promise<Charge>;
  getCredits(customerId: string): Promise<CreditBalance>;
  addCredits(customerId: string, amount: number, currency: string): Promise<CreditBalance>;
}

export interface WebhookEvent {
  type: string;
  payload: unknown;
  signature: string;
}

export interface WebhookProcessor {
  process(event: WebhookEvent): Promise<void>;
}

export interface Refund {
  id: string;
  chargeId: string;
  externalId: string;
  amount: number;
  reason?: string;
  status: 'succeeded' | 'failed' | 'pending';
  createdAt: Date;
}

export interface CreditTransaction {
  id: string;
  tenantId: string;
  customerId: string;
  amount: number;
  currency: string;
  balanceAfter: number;
  description: string;
  referenceType?: string;
  referenceId?: string;
  createdAt: Date;
}

export interface UsageRecord {
  metricName: string;
  quantity: number;
  timestamp: Date;
  customerId: string;
  tenantId: string;
}

export interface UsageSummary {
  metricName: string;
  totalQuantity: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface Invoice {
  id: string;
  externalId: string;
  customerId: string;
  amount: number;
  currency: string;
  status: string;
  pdfUrl?: string;
  periodStart?: Date;
  periodEnd?: Date;
}

export interface Plan {
  id: string;
  externalId: string;
  name: string;
  description?: string;
  amount: number;
  currency: string;
  interval: 'month' | 'year';
  features?: Record<string, unknown>;
  active: boolean;
}

export interface DateRange {
  from: Date;
  to: Date;
}
