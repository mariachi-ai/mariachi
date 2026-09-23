import { defineTable, column } from '@mariachi/database';

export const aiSessionsTable = defineTable('ai_sessions', {
  /** Caller-chosen id (any string), as passed to `SessionManager.create`. */
  id:                column.text().primaryKey(),
  tenantId:          column.text().notNull(),
  userId:            column.text().notNull(),
  model:             column.text().notNull(),
  systemPrompt:      column.text(),
  config:            column.json(),
  totalInputTokens:  column.integer().notNull().default(0),
  totalOutputTokens: column.integer().notNull().default(0),
  createdAt:         column.timestamp().notNull().defaultNow(),
  updatedAt:         column.timestamp().notNull().defaultNow(),
});
