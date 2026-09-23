import { and, asc, desc, eq, gte, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { BillingError, type Context } from '@mariachi/core';
import { compileTable, currentTransaction, mapPgError, withTransaction, type DrizzleDb } from '@mariachi/database-postgres';
import {
  billingChargesTable,
  billingCreditTransactionsTable,
  billingCustomersTable,
  billingDisputesTable,
  billingInvoicesTable,
  billingPlansTable,
  billingRefundsTable,
  billingSubscriptionsTable,
  billingUsageRecordsTable,
  billingWebhookEventsTable,
} from '../schema/index';
import type {
  BillingStore,
  Charge,
  CreditTransaction,
  Customer,
  DateRange,
  Dispute,
  Invoice,
  Plan,
  Refund,
  Subscription,
  SubscriptionStatus,
  UsageRecord,
  UsageSummary,
  StoredWebhookEvent,
  WebhookEventStatus,
} from '../types';

const customers = compileTable(billingCustomersTable);
const subscriptions = compileTable(billingSubscriptionsTable);
const charges = compileTable(billingChargesTable);
const refunds = compileTable(billingRefundsTable);
const invoices = compileTable(billingInvoicesTable);
const disputes = compileTable(billingDisputesTable);
const ledger = compileTable(billingCreditTransactionsTable);
const usage = compileTable(billingUsageRecordsTable);
const webhookEvents = compileTable(billingWebhookEventsTable);
const plans = compileTable(billingPlansTable);

/** Compiled Drizzle tables, for drizzle-kit schema files and custom queries. */
export const billingTables = { customers, subscriptions, charges, refunds, invoices, disputes, ledger, usage, webhookEvents, plans };

type Row = Record<string, any>;

function toCustomer(r: Row): Customer {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    tenantId: r.tenantId,
    delinquent: r.delinquent,
    metadata: r.metadata ?? {},
  };
}

function toSubscription(r: Row): Subscription {
  return {
    id: r.id,
    customerId: r.customerId,
    tenantId: r.tenantId,
    planId: r.planId,
    quantity: r.quantity,
    status: r.status,
    currentPeriodStart: r.currentPeriodStart,
    currentPeriodEnd: r.currentPeriodEnd,
    cancelAtPeriodEnd: r.cancelAtPeriodEnd,
    cancelAt: r.cancelAt,
    canceledAt: r.canceledAt,
    trialEnd: r.trialEnd,
    metadata: r.metadata ?? {},
  };
}

function toWebhook(r: Row): StoredWebhookEvent {
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    error: r.error,
    attempts: Number(r.attempts ?? 0),
    payload: r.payload ?? undefined,
  };
}

function toTransaction(r: Row): CreditTransaction {
  return {
    id: r.id,
    tenantId: r.tenantId,
    customerId: r.customerId,
    amount: Number(r.amount),
    currency: r.currency,
    balanceAfter: Number(r.balanceAfter),
    description: r.description,
    referenceType: r.referenceType,
    referenceId: r.referenceId,
    idempotencyKey: r.idempotencyKey,
    createdAt: r.createdAt,
  };
}

/**
 * Postgres `BillingStore`. Requires the tables from `@mariachi/billing/schema`
 * (run `mariachi db generate` after adding them to your schema file).
 */
export class DrizzleBillingStore implements BillingStore {
  constructor(private readonly database: DrizzleDb) {}

  private get db(): DrizzleDb {
    return (currentTransaction() as DrizzleDb | undefined) ?? this.database;
  }

  private async run<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof BillingError) throw err;
      throw mapPgError(err, `billing.${operation}`);
    }
  }

  async upsertCustomer(customer: Customer, occurredAt: Date): Promise<void> {
    await this.run('upsertCustomer', () =>
      this.db
        .insert(customers)
        .values({ ...customer, lastEventAt: occurredAt })
        .onConflictDoUpdate({
          target: customers.id,
          set: {
            email: customer.email,
            name: customer.name,
            delinquent: customer.delinquent,
            metadata: customer.metadata,
            tenantId: sql`coalesce(excluded.tenant_id, ${customers.tenantId})`,
            lastEventAt: occurredAt,
            updatedAt: new Date(),
          },
          setWhere: lte(customers.lastEventAt, occurredAt),
        }),
    );
  }

  async markCustomerDeleted(customerId: string, occurredAt: Date): Promise<void> {
    await this.run('markCustomerDeleted', () =>
      this.db
        .update(customers)
        .set({ deletedAt: occurredAt, lastEventAt: occurredAt, updatedAt: new Date() })
        .where(and(eq(customers.id, customerId), lte(customers.lastEventAt, occurredAt))),
    );
  }

  async findCustomer(customerId: string): Promise<Customer | null> {
    const rows = await this.run('findCustomer', () =>
      this.db.select().from(customers).where(and(eq(customers.id, customerId), isNull(customers.deletedAt))).limit(1),
    );
    return rows[0] ? toCustomer(rows[0]) : null;
  }

  async findCustomerByTenant(tenantId: string): Promise<Customer | null> {
    const rows = await this.run('findCustomerByTenant', () =>
      this.db.select().from(customers).where(and(eq(customers.tenantId, tenantId), isNull(customers.deletedAt))).limit(1),
    );
    return rows[0] ? toCustomer(rows[0]) : null;
  }

  async upsertSubscription(sub: Subscription, occurredAt: Date): Promise<{ applied: boolean; previousStatus: SubscriptionStatus | null }> {
    return this.run('upsertSubscription', async () => {
      const prev = await this.db.select({ status: subscriptions.status }).from(subscriptions).where(eq(subscriptions.id, sub.id)).limit(1);
      const { id, ...rest } = sub;
      const result = await this.db
        .insert(subscriptions)
        .values({ ...sub, lastEventAt: occurredAt })
        .onConflictDoUpdate({
          target: subscriptions.id,
          set: {
            ...rest,
            tenantId: sql`coalesce(excluded.tenant_id, ${subscriptions.tenantId})`,
            lastEventAt: occurredAt,
            updatedAt: new Date(),
          },
          setWhere: lte(subscriptions.lastEventAt, occurredAt),
        })
        .returning({ id: subscriptions.id });
      void id;
      return { applied: result.length > 0, previousStatus: (prev[0]?.status as SubscriptionStatus | undefined) ?? null };
    });
  }

  async findSubscription(id: string): Promise<Subscription | null> {
    const rows = await this.run('findSubscription', () => this.db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1));
    return rows[0] ? toSubscription(rows[0]) : null;
  }

  async listSubscriptionsByTenant(tenantId: string): Promise<Subscription[]> {
    const rows = await this.run('listSubscriptionsByTenant', () =>
      this.db.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId)).orderBy(desc(subscriptions.createdAt)),
    );
    return rows.map(toSubscription);
  }

  async upsertCharge(charge: Charge, occurredAt: Date): Promise<void> {
    const { id, ...rest } = charge;
    await this.run('upsertCharge', () =>
      this.db
        .insert(charges)
        .values({ ...charge, lastEventAt: occurredAt })
        .onConflictDoUpdate({
          target: charges.id,
          set: {
            ...rest,
            amountRefunded: sql`greatest(${charges.amountRefunded}, excluded.amount_refunded)`,
            tenantId: sql`coalesce(excluded.tenant_id, ${charges.tenantId})`,
            lastEventAt: occurredAt,
            updatedAt: new Date(),
          },
          setWhere: lte(charges.lastEventAt, occurredAt),
        }),
    );
    void id;
  }

  async upsertRefund(refund: Refund): Promise<void> {
    const { id, ...rest } = refund;
    await this.run('upsertRefund', () =>
      this.db.insert(refunds).values(refund).onConflictDoUpdate({ target: refunds.id, set: { ...rest, updatedAt: new Date() } }),
    );
    void id;
  }

  async upsertInvoice(invoice: Invoice, occurredAt: Date): Promise<void> {
    const { id, ...rest } = invoice;
    await this.run('upsertInvoice', () =>
      this.db
        .insert(invoices)
        .values({ ...invoice, lastEventAt: occurredAt })
        .onConflictDoUpdate({
          target: invoices.id,
          set: { ...rest, lastEventAt: occurredAt, updatedAt: new Date() },
          setWhere: lte(invoices.lastEventAt, occurredAt),
        }),
    );
    void id;
  }

  async upsertDispute(dispute: Dispute, occurredAt: Date): Promise<void> {
    const { id, ...rest } = dispute;
    await this.run('upsertDispute', () =>
      this.db
        .insert(disputes)
        .values({ ...dispute, lastEventAt: occurredAt })
        .onConflictDoUpdate({
          target: disputes.id,
          set: { ...rest, lastEventAt: occurredAt, updatedAt: new Date() },
          setWhere: lte(disputes.lastEventAt, occurredAt),
        }),
    );
    void id;
  }

  async upsertPlan(plan: Plan, occurredAt: Date): Promise<void> {
    const values = {
      productId: plan.productId,
      name: plan.name,
      description: plan.description,
      amount: plan.amount,
      currency: plan.currency,
      interval: plan.interval,
      active: plan.active,
      metadata: plan.metadata,
      lastEventAt: occurredAt,
    };
    await this.run('upsertPlan', () =>
      this.db
        .insert(plans)
        .values({ id: plan.id, ...values })
        .onConflictDoUpdate({
          target: plans.id,
          set: { ...values, updatedAt: new Date() },
          setWhere: or(isNull(plans.lastEventAt), lte(plans.lastEventAt, occurredAt)),
        }),
    );
  }

  async listPlans(options: { activeOnly?: boolean } = {}): Promise<Plan[]> {
    const rows = await this.run('listPlans', () =>
      this.db
        .select()
        .from(plans)
        .where((options.activeOnly ?? true) ? eq(plans.active, true) : undefined)
        .orderBy(asc(plans.amount)),
    );
    return rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      name: r.name,
      description: r.description ?? null,
      amount: Number(r.amount),
      currency: r.currency,
      interval: (r.interval as Plan['interval']) ?? null,
      active: r.active,
      metadata: (r.metadata as Record<string, string> | null) ?? {},
    }));
  }

  async recordWebhookEvent(event: { id: string; type: string; status: WebhookEventStatus; error?: string; payload?: unknown }): Promise<void> {
    const processedAt = event.status === 'processed' || event.status === 'ignored' ? new Date() : null;
    await this.run('recordWebhookEvent', () =>
      this.db
        .insert(webhookEvents)
        .values({
          id: event.id,
          type: event.type,
          status: event.status,
          error: event.error ?? null,
          attempts: 1,
          payload: event.payload ?? null,
          processedAt,
        })
        .onConflictDoUpdate({
          target: webhookEvents.id,
          set: {
            status: event.status,
            error: event.error ?? null,
            processedAt,
            payload: event.payload === undefined ? sql`${webhookEvents.payload}` : event.payload,
            attempts: event.status === 'processing' ? sql`${webhookEvents.attempts} + 1` : webhookEvents.attempts,
            updatedAt: new Date(),
          },
        }),
    );
  }

  async getWebhookEvent(id: string): Promise<StoredWebhookEvent | null> {
    const rows = await this.run('getWebhookEvent', () => this.db.select().from(webhookEvents).where(eq(webhookEvents.id, id)).limit(1));
    return rows[0] ? toWebhook(rows[0]) : null;
  }

  async listWebhookEvents(filter: { status?: WebhookEventStatus } = {}): Promise<StoredWebhookEvent[]> {
    const rows = await this.run('listWebhookEvents', () =>
      filter.status
        ? this.db.select().from(webhookEvents).where(eq(webhookEvents.status, filter.status))
        : this.db.select().from(webhookEvents),
    );
    return rows.map(toWebhook);
  }

  async recordUsage(record: UsageRecord): Promise<boolean> {
    const rows = await this.run('recordUsage', () =>
      this.db.insert(usage).values(record).onConflictDoNothing().returning({ id: usage.id }),
    );
    return rows.length > 0;
  }

  async summarizeUsage(tenantId: string, metricName: string, range: DateRange): Promise<UsageSummary> {
    const rows = await this.run('summarizeUsage', () =>
      this.db
        .select({ total: sql<string>`coalesce(sum(${usage.quantity}), 0)` })
        .from(usage)
        .where(and(eq(usage.tenantId, tenantId), eq(usage.metricName, metricName), gte(usage.timestamp, range.from), lt(usage.timestamp, range.to))),
    );
    return { metricName, totalQuantity: Number(rows[0]?.total ?? 0), periodStart: range.from, periodEnd: range.to };
  }

  async appendCreditTransaction(
    entry: Omit<CreditTransaction, 'id' | 'balanceAfter' | 'createdAt'>,
    options: { allowNegative?: boolean } = {},
  ): Promise<CreditTransaction> {
    const ctx = { traceId: 'billing-ledger' } as Context;
    return withTransaction(this.database, ctx, async () =>
      this.run('appendCreditTransaction', async () => {
        const lockKey = `${entry.tenantId}:${entry.customerId}:${entry.currency}`;
        await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

        if (entry.idempotencyKey) {
          const existing = await this.db
            .select()
            .from(ledger)
            .where(and(eq(ledger.tenantId, entry.tenantId), eq(ledger.idempotencyKey, entry.idempotencyKey)))
            .limit(1);
          if (existing[0]) return toTransaction(existing[0]);
        }

        const current = await this.getCreditLedgerBalance(entry.tenantId, entry.customerId, entry.currency);
        const balanceAfter = current + entry.amount;
        if (balanceAfter < 0 && !options.allowNegative) {
          throw new BillingError('billing/insufficient-credits', 'Insufficient credits', { balance: current, requested: -entry.amount });
        }
        const [row] = await this.db
          .insert(ledger)
          .values({ ...entry, balanceAfter, createdAt: sql`clock_timestamp()` })
          .returning();
        return toTransaction(row);
      }),
    );
  }

  async getCreditLedgerBalance(tenantId: string, customerId: string, currency: string): Promise<number> {
    const rows = await this.run('getCreditLedgerBalance', () =>
      this.db
        .select({ balanceAfter: ledger.balanceAfter })
        .from(ledger)
        .where(and(eq(ledger.tenantId, tenantId), eq(ledger.customerId, customerId), eq(ledger.currency, currency)))
        .orderBy(desc(ledger.createdAt))
        .limit(1),
    );
    return Number(rows[0]?.balanceAfter ?? 0);
  }

  async listCreditTransactions(tenantId: string, customerId: string, options: { limit?: number } = {}): Promise<CreditTransaction[]> {
    const rows = await this.run('listCreditTransactions', () =>
      this.db
        .select()
        .from(ledger)
        .where(and(eq(ledger.tenantId, tenantId), eq(ledger.customerId, customerId)))
        .orderBy(desc(ledger.createdAt))
        .limit(Math.min(options.limit ?? 50, 500)),
    );
    return rows.map(toTransaction);
  }
}
