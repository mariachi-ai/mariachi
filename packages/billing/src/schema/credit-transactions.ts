import { defineTable, column } from '@mariachi/database';

export const billingCreditTransactionsTable = defineTable('billing_credit_transactions', {
  id:            column.uuid().primaryKey().defaultRandom(),
  tenantId:      column.text().notNull(),
  customerId:    column.uuid().notNull(),
  amount:        column.integer().notNull(),
  currency:      column.text().notNull(),
  balanceAfter:  column.integer().notNull(),
  description:   column.text().notNull(),
  referenceType: column.text(),
  referenceId:   column.text(),
  createdAt:     column.timestamp().notNull().defaultNow(),
});
