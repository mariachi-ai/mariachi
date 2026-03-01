import { defineTable, column } from '@mariachi/database';

export const auditLogsTable = defineTable('audit_logs', {
  id:         column.uuid().primaryKey().defaultRandom(),
  actor:      column.text().notNull(),
  action:     column.text().notNull(),
  resource:   column.text().notNull(),
  resourceId: column.text().notNull(),
  tenantId:   column.text(),
  ipAddress:  column.text(),
  userAgent:  column.text(),
  occurredAt: column.timestamp().notNull().defaultNow(),
  metadata:   column.json(),
});
