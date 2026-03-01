import { defineTable, column } from '@mariachi/database';

export const aiMessagesTable = defineTable('ai_messages', {
  id:           column.uuid().primaryKey().defaultRandom(),
  sessionId:    column.uuid().notNull(),
  role:         column.text().notNull(),
  content:      column.text().notNull(),
  toolCalls:    column.json(),
  inputTokens:  column.integer(),
  outputTokens: column.integer(),
  model:        column.text(),
  latencyMs:    column.integer(),
  createdAt:    column.timestamp().notNull().defaultNow(),
});
