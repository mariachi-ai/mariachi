import { defineTable, column } from '@mariachi/database';

export const billingPlansTable = defineTable('billing_plans', {
  id:          column.uuid().primaryKey().defaultRandom(),
  externalId:  column.text().notNull(),
  name:        column.text().notNull(),
  description: column.text(),
  amount:      column.integer().notNull(),
  currency:    column.text().notNull(),
  interval:    column.text().notNull(),
  features:    column.json(),
  active:      column.boolean().notNull().default(true),
  createdAt:   column.timestamp().notNull().defaultNow(),
  updatedAt:   column.timestamp().notNull().defaultNow(),
});
