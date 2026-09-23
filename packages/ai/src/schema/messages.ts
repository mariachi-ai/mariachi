import { defineTable, column, index } from '@mariachi/database';

/** Messages per session, ordered by `position` (timestamps collide within one batch insert). */
export const aiMessagesTable = defineTable(
  'ai_messages',
  {
  id:           column.uuid().primaryKey().defaultRandom(),
  sessionId:    column.text().notNull(),
  position:     column.integer().notNull(),
  role:         column.text().notNull(),
  content:      column.text().notNull(),
  toolCalls:    column.json(),
  inputTokens:  column.integer(),
  outputTokens: column.integer(),
  model:        column.text(),
  latencyMs:    column.integer(),
  createdAt:    column.timestamp().notNull().defaultNow(),
  },
  { indexes: [index('ai_messages_session_position_uniq').on('sessionId', 'position').unique()] },
);
