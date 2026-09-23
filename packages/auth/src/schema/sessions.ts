import { defineTable, column } from '@mariachi/database';

export const sessionsTable = defineTable('sessions', {
  id:           column.uuid().primaryKey().defaultRandom(),
  userId:       column.text().notNull(),
  tenantId:     column.text().notNull(),
  /** sha256 of the opaque session token; the token itself is never stored. */
  tokenHash:    column.text().notNull().unique(),
  scopes:       column.json().notNull().default([]),
  userAgent:    column.text(),
  ipAddress:    column.text(),
  metadata:     column.json(),
  expiresAt:    column.timestamp().notNull(),
  revokedAt:    column.timestamp(),
  createdAt:    column.timestamp().notNull().defaultNow(),
  lastActiveAt: column.timestamp().notNull().defaultNow(),
});
