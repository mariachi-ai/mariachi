import { defineTable, column } from '@mariachi/database';

export const billingDisputesTable = defineTable('billing_disputes', {
  id:            column.text().primaryKey(),
  tenantId:      column.text(),
  chargeId:      column.text().notNull().index(),
  amount:        column.bigint().notNull(),
  currency:      column.varchar(3).notNull(),
  reason:        column.text().notNull(),
  status:        column.text().notNull(),
  evidenceDueBy: column.timestamp(),
  lastEventAt:   column.timestamp().notNull(),
  createdAt:     column.timestamp().notNull().defaultNow(),
  updatedAt:     column.timestamp().notNull().defaultNow(),
});
