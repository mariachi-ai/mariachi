import { defineTable, column } from '@mariachi/database';

export const billingSubscriptionsTable = defineTable('billing_subscriptions', {
  id:                 column.text().primaryKey(),
  tenantId:           column.text(),
  customerId:         column.text().notNull().index(),
  planId:             column.text().notNull(),
  quantity:           column.integer().notNull().default(1),
  status:             column.text().notNull(),
  currentPeriodStart: column.timestamp(),
  currentPeriodEnd:   column.timestamp(),
  cancelAtPeriodEnd:  column.boolean().notNull().default(false),
  cancelAt:           column.timestamp(),
  canceledAt:         column.timestamp(),
  trialEnd:           column.timestamp(),
  metadata:           column.json().$type<Record<string, string>>(),
  lastEventAt:        column.timestamp().notNull(),
  createdAt:          column.timestamp().notNull().defaultNow(),
  updatedAt:          column.timestamp().notNull().defaultNow(),
});
