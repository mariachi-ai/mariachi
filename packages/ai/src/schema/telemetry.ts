import { defineTable, column } from '@mariachi/database';

export const aiTelemetryTable = defineTable('ai_telemetry', {
  id:           column.uuid().primaryKey().defaultRandom(),
  sessionId:    column.uuid(),
  tenantId:     column.text().notNull(),
  model:        column.text().notNull(),
  inputTokens:  column.integer().notNull(),
  outputTokens: column.integer().notNull(),
  latencyMs:    column.integer().notNull(),
  costUsd:      column.numeric().notNull().precision(10, 6),
  createdAt:    column.timestamp().notNull().defaultNow(),
});
