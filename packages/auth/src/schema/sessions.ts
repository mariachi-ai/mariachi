import { defineTable, column } from '@mariachi/database';

export const sessionsTable = defineTable('sessions', {
  id:           column.uuid().primaryKey().defaultRandom(),
  userId:       column.text().notNull(),
  tenantId:     column.text().notNull(),
  token:        column.text().notNull().unique(),
  userAgent:    column.text(),
  ipAddress:    column.text(),
  metadata:     column.json(),
  expiresAt:    column.timestamp().notNull(),
  createdAt:    column.timestamp().notNull().defaultNow(),
  lastActiveAt: column.timestamp().notNull().defaultNow(),
});
