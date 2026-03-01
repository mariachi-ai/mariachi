import { defineTable, column } from '@mariachi/database';

export const billingSubscriptionsTable = defineTable('billing_subscriptions', {
  id:                 column.uuid().primaryKey().defaultRandom(),
  tenantId:           column.text().notNull(),
  customerId:         column.uuid().notNull(),
  externalId:         column.text().notNull(),
  planId:             column.text().notNull(),
  status:             column.text().notNull(),
  currentPeriodStart: column.timestamp(),
  currentPeriodEnd:   column.timestamp(),
  cancelAt:           column.timestamp(),
  canceledAt:         column.timestamp(),
  trialEnd:           column.timestamp(),
  metadata:           column.json(),
  createdAt:          column.timestamp().notNull().defaultNow(),
  updatedAt:          column.timestamp().notNull().defaultNow(),
});
