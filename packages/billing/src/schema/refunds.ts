import { defineTable, column } from '@mariachi/database';

export const billingRefundsTable = defineTable('billing_refunds', {
  id:         column.uuid().primaryKey().defaultRandom(),
  chargeId:   column.uuid().notNull(),
  externalId: column.text().notNull(),
  amount:     column.integer().notNull(),
  reason:     column.text(),
  status:     column.text().notNull(),
  createdAt:  column.timestamp().notNull().defaultNow(),
});
