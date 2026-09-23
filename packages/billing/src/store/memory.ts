import { randomUUID } from 'node:crypto';
import { BillingError } from '@mariachi/core';
import type {
  BillingStore,
  Charge,
  Plan,
  StoredWebhookEvent,
  CreditTransaction,
  Customer,
  DateRange,
  Dispute,
  Invoice,
  Refund,
  Subscription,
  SubscriptionStatus,
  UsageRecord,
  UsageSummary,
  WebhookEventStatus,
} from '../types';

interface Versioned<T> {
  value: T;
  at: number;
}

/** Single-process `BillingStore` for tests and local development. */
export class MemoryBillingStore implements BillingStore {
  readonly customers = new Map<string, Versioned<Customer> & { deleted?: boolean }>();
  readonly subscriptions = new Map<string, Versioned<Subscription>>();
  readonly charges = new Map<string, Versioned<Charge>>();
  readonly refunds = new Map<string, Refund>();
  readonly invoices = new Map<string, Versioned<Invoice>>();
  readonly disputes = new Map<string, Versioned<Dispute>>();
  readonly plans = new Map<string, Versioned<Plan>>();
  readonly webhookEvents = new Map<string, StoredWebhookEvent>();
  readonly usage: UsageRecord[] = [];
  readonly ledger: CreditTransaction[] = [];

  private upsert<T>(map: Map<string, Versioned<T>>, id: string, value: T, occurredAt: Date): boolean {
    const cur = map.get(id);
    if (cur && cur.at > occurredAt.getTime()) return false;
    map.set(id, { value, at: occurredAt.getTime() });
    return true;
  }

  async upsertCustomer(customer: Customer, occurredAt: Date): Promise<void> {
    const cur = this.customers.get(customer.id);
    if (cur && cur.at > occurredAt.getTime()) return;
    this.customers.set(customer.id, {
      value: { ...customer, tenantId: customer.tenantId ?? cur?.value.tenantId ?? null },
      at: occurredAt.getTime(),
    });
  }

  async markCustomerDeleted(customerId: string, occurredAt: Date): Promise<void> {
    const cur = this.customers.get(customerId);
    if (cur) this.customers.set(customerId, { ...cur, deleted: true, at: Math.max(cur.at, occurredAt.getTime()) });
  }

  async findCustomer(customerId: string): Promise<Customer | null> {
    const c = this.customers.get(customerId);
    return c && !c.deleted ? c.value : null;
  }

  async findCustomerByTenant(tenantId: string): Promise<Customer | null> {
    for (const c of this.customers.values()) if (!c.deleted && c.value.tenantId === tenantId) return c.value;
    return null;
  }

  async upsertSubscription(subscription: Subscription, occurredAt: Date): Promise<{ applied: boolean; previousStatus: SubscriptionStatus | null }> {
    const previousStatus = this.subscriptions.get(subscription.id)?.value.status ?? null;
    const applied = this.upsert(this.subscriptions, subscription.id, subscription, occurredAt);
    return { applied, previousStatus };
  }

  async findSubscription(id: string): Promise<Subscription | null> {
    return this.subscriptions.get(id)?.value ?? null;
  }

  async listSubscriptionsByTenant(tenantId: string): Promise<Subscription[]> {
    return [...this.subscriptions.values()].map((v) => v.value).filter((s) => s.tenantId === tenantId);
  }

  async upsertCharge(charge: Charge, occurredAt: Date): Promise<void> {
    const cur = this.charges.get(charge.id);
    const merged = cur ? { ...charge, amountRefunded: Math.max(charge.amountRefunded, cur.value.amountRefunded) } : charge;
    this.upsert(this.charges, charge.id, merged, occurredAt);
  }

  async upsertRefund(refund: Refund): Promise<void> {
    this.refunds.set(refund.id, refund);
  }

  async upsertInvoice(invoice: Invoice, occurredAt: Date): Promise<void> {
    this.upsert(this.invoices, invoice.id, invoice, occurredAt);
  }

  async upsertDispute(dispute: Dispute, occurredAt: Date): Promise<void> {
    this.upsert(this.disputes, dispute.id, dispute, occurredAt);
  }

  async upsertPlan(plan: Plan, occurredAt: Date): Promise<void> {
    this.upsert(this.plans, plan.id, plan, occurredAt);
  }

  async listPlans(options: { activeOnly?: boolean } = {}): Promise<Plan[]> {
    return [...this.plans.values()].map((v) => v.value).filter((p) => !(options.activeOnly ?? true) || p.active);
  }

  async recordWebhookEvent(event: { id: string; type: string; status: WebhookEventStatus; error?: string; payload?: unknown }): Promise<void> {
    const cur = this.webhookEvents.get(event.id);
    this.webhookEvents.set(event.id, {
      id: event.id,
      type: event.type,
      status: event.status,
      error: event.error,
      attempts: (cur?.attempts ?? 0) + (event.status === 'processing' ? 1 : 0),
      payload: event.payload ?? cur?.payload,
    });
  }

  async getWebhookEvent(id: string): Promise<StoredWebhookEvent | null> {
    return this.webhookEvents.get(id) ?? null;
  }

  async listWebhookEvents(filter: { status?: WebhookEventStatus } = {}): Promise<StoredWebhookEvent[]> {
    return [...this.webhookEvents.values()].filter((e) => !filter.status || e.status === filter.status);
  }

  async recordUsage(record: UsageRecord): Promise<boolean> {
    if (record.idempotencyKey && this.usage.some((u) => u.tenantId === record.tenantId && u.idempotencyKey === record.idempotencyKey)) {
      return false;
    }
    this.usage.push(record);
    return true;
  }

  async summarizeUsage(tenantId: string, metricName: string, range: DateRange): Promise<UsageSummary> {
    const totalQuantity = this.usage
      .filter((u) => u.tenantId === tenantId && u.metricName === metricName && u.timestamp >= range.from && u.timestamp < range.to)
      .reduce((sum, u) => sum + u.quantity, 0);
    return { metricName, totalQuantity, periodStart: range.from, periodEnd: range.to };
  }

  async appendCreditTransaction(
    entry: Omit<CreditTransaction, 'id' | 'balanceAfter' | 'createdAt'>,
    options: { allowNegative?: boolean } = {},
  ): Promise<CreditTransaction> {
    if (entry.idempotencyKey) {
      const existing = this.ledger.find((t) => t.tenantId === entry.tenantId && t.idempotencyKey === entry.idempotencyKey);
      if (existing) return existing;
    }
    const current = await this.getCreditLedgerBalance(entry.tenantId, entry.customerId, entry.currency);
    const balanceAfter = current + entry.amount;
    if (balanceAfter < 0 && !options.allowNegative) {
      throw new BillingError('billing/insufficient-credits', 'Insufficient credits', { balance: current, requested: -entry.amount });
    }
    const tx: CreditTransaction = { ...entry, id: randomUUID(), balanceAfter, createdAt: new Date() };
    this.ledger.push(tx);
    return tx;
  }

  async getCreditLedgerBalance(tenantId: string, customerId: string, currency: string): Promise<number> {
    for (let i = this.ledger.length - 1; i >= 0; i--) {
      const t = this.ledger[i];
      if (t.tenantId === tenantId && t.customerId === customerId && t.currency === currency) return t.balanceAfter;
    }
    return 0;
  }

  async listCreditTransactions(tenantId: string, customerId: string, options: { limit?: number } = {}): Promise<CreditTransaction[]> {
    return this.ledger
      .filter((t) => t.tenantId === tenantId && t.customerId === customerId)
      .reverse()
      .slice(0, options.limit ?? 50);
  }
}
