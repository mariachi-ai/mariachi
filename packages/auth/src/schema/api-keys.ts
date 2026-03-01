import { defineTable, column } from '@mariachi/database';

export const apiKeysTable = defineTable('api_keys', {
  id:         column.uuid().primaryKey().defaultRandom(),
  tenantId:   column.text().notNull(),
  name:       column.text().notNull(),
  hashedKey:  column.text().notNull().unique(),
  prefix:     column.text().notNull(),
  scopes:     column.json().notNull().default([]),
  active:     column.boolean().notNull().default(true),
  lastUsedAt: column.timestamp(),
  expiresAt:  column.timestamp(),
  createdAt:  column.timestamp().notNull().defaultNow(),
  updatedAt:  column.timestamp().notNull().defaultNow(),
});
