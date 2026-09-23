import { defineTable, column } from '@mariachi/database';

/** Audit trail of provider webhooks. Dedup itself is done by the IdempotencyStore. */
export const billingWebhookEventsTable = defineTable('billing_webhook_events', {
  id:          column.text().primaryKey(),
  type:        column.text().notNull(),
  status:      column.enum(['processing', 'processed', 'failed', 'ignored'], { enumName: 'billing_webhook_status' }).notNull(),
  error:       column.text(),
  attempts:    column.integer().notNull().default(0),
  /** Verified provider event, kept so failed deliveries can be replayed. */
  payload:     column.json(),
  processedAt: column.timestamp(),
  createdAt:   column.timestamp().notNull().defaultNow(),
  updatedAt:   column.timestamp().notNull().defaultNow(),
});
