import { defineTable, column } from '@mariachi/database';

/** Payments keyed by payment intent id (`pi_...`). */
export const billingChargesTable = defineTable('billing_charges', {
  id:             column.text().primaryKey(),
  tenantId:       column.text(),
  customerId:     column.text().notNull().index(),
  amount:         column.bigint().notNull(),
  amountRefunded: column.bigint().notNull().default(0),
  currency:       column.varchar(3).notNull(),
  status:         column.text().notNull(),
  description:    column.text(),
  failureCode:    column.text(),
  failureReason:  column.text(),
  invoiceId:      column.text(),
  metadata:       column.json().$type<Record<string, string>>(),
  lastEventAt:    column.timestamp().notNull(),
  createdAt:      column.timestamp().notNull().defaultNow(),
  updatedAt:      column.timestamp().notNull().defaultNow(),
});
