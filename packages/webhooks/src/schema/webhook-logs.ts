import { defineTable, column } from '@mariachi/database';

export const webhookLogsTable = defineTable('webhook_logs', {
  id:         column.uuid().primaryKey().defaultRandom(),
  route:      column.text().notNull(),
  controller: column.text().notNull(),
  method:     column.text().notNull(),
  headers:    column.json().notNull(),
  payload:    column.json(),
  identity:   column.json(),
  status:     column.text().notNull(),
  response:   column.json(),
  error:      column.text(),
  ttl:        column.text().notNull(),
  createdAt:  column.timestamp().notNull().defaultNow(),
  expiresAt:  column.timestamp().notNull(),
});
