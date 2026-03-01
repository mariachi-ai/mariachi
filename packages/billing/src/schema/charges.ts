import { defineTable, column } from '@mariachi/database';

export const billingChargesTable = defineTable('billing_charges', {
  id:             column.uuid().primaryKey().defaultRandom(),
  tenantId:       column.text().notNull(),
  customerId:     column.uuid().notNull(),
  externalId:     column.text().notNull(),
  amount:         column.integer().notNull(),
  currency:       column.text().notNull(),
  status:         column.text().notNull(),
  description:    column.text(),
  idempotencyKey: column.text(),
  failureReason:  column.text(),
  metadata:       column.json(),
  createdAt:      column.timestamp().notNull().defaultNow(),
});
