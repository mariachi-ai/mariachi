import { defineTable, column } from '@mariachi/database';

export const billingRefundsTable = defineTable('billing_refunds', {
  id:        column.text().primaryKey(),
  tenantId:  column.text(),
  chargeId:  column.text().notNull().index(),
  amount:    column.bigint().notNull(),
  currency:  column.varchar(3).notNull(),
  reason:    column.text(),
  status:    column.text().notNull(),
  createdAt: column.timestamp().notNull().defaultNow(),
  updatedAt: column.timestamp().notNull().defaultNow(),
});
