import { defineTable, column } from '@mariachi/database';

export const featureFlagsTable = defineTable('feature_flags', {
  id:               column.uuid().primaryKey().defaultRandom(),
  key:              column.text().notNull().unique(),
  description:      column.text(),
  enabled:          column.boolean().notNull().default(false),
  tenantOverrides:  column.json(),
  metadata:         column.json(),
  createdAt:        column.timestamp().notNull().defaultNow(),
  updatedAt:        column.timestamp().notNull().defaultNow(),
});
