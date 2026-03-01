import { defineTable, column } from '@mariachi/database';

export const billingWebhookEventsTable = defineTable('billing_webhook_events', {
  id:          column.uuid().primaryKey().defaultRandom(),
  externalId:  column.text().notNull().unique(),
  type:        column.text().notNull(),
  status:      column.text().notNull().default('received'),
  payload:     column.json().notNull(),
  error:       column.text(),
  attempts:    column.integer().notNull().default(0),
  processedAt: column.timestamp(),
  createdAt:   column.timestamp().notNull().defaultNow(),
});
