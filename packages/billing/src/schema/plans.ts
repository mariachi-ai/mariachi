import { defineTable, column } from '@mariachi/database';

/** Local catalog mirror keyed by provider price id. Filled by `syncPlans` and `price.*` webhooks. */
export const billingPlansTable = defineTable('billing_plans', {
  id:          column.text().primaryKey(),
  productId:   column.text().notNull(),
  name:        column.text().notNull(),
  description: column.text(),
  amount:      column.bigint().notNull(),
  currency:    column.varchar(3).notNull(),
  interval:    column.text(),
  features:    column.json(),
  metadata:    column.json(),
  lastEventAt: column.timestamp(),
  active:      column.boolean().notNull().default(true),
  createdAt:   column.timestamp().notNull().defaultNow(),
  updatedAt:   column.timestamp().notNull().defaultNow(),
});
