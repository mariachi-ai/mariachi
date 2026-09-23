import { defineTable, column, index } from '@mariachi/database';

/** Append-only prepaid credit ledger. `balanceAfter` is the running balance per (tenant, customer, currency). */
export const billingCreditTransactionsTable = defineTable(
  'billing_credit_transactions',
  {
    id:             column.uuid().primaryKey().defaultRandom(),
    tenantId:       column.text().notNull(),
    customerId:     column.text().notNull(),
    amount:         column.bigint().notNull(),
    currency:       column.varchar(3).notNull(),
    balanceAfter:   column.bigint().notNull(),
    description:    column.text().notNull(),
    referenceType:  column.text(),
    referenceId:    column.text(),
    idempotencyKey: column.text(),
    createdAt:      column.timestamp().notNull().defaultNow(),
  },
  {
    indexes: [
      index('billing_credit_tx_ledger_idx').on('tenantId', 'customerId', 'currency', 'createdAt'),
      index('billing_credit_tx_idem_uniq').on('tenantId', 'idempotencyKey').unique().where('idempotency_key IS NOT NULL'),
    ],
  },
);
