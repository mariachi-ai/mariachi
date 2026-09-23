import { defineTable, column } from '@mariachi/database';

/** Durable dedup records for auth provider webhooks. Prefer this or Redis over process memory. */
export const authWebhookDedupTable = defineTable('auth_webhook_dedup', {
  key:       column.text().primaryKey(),
  state:     column.text().notNull(),
  expiresAt: column.timestamp().notNull(),
});
