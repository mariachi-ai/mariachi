import { defineTable, column } from '@mariachi/database';

export const aiSessionsTable = defineTable('ai_sessions', {
  id:                column.uuid().primaryKey().defaultRandom(),
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
