import { defineTable, column } from '@mariachi/database';

export const permissionsTable = defineTable('permissions', {
  id:          column.uuid().primaryKey().defaultRandom(),
  action:      column.text().notNull(),
  resource:    column.text().notNull(),
  description: column.text(),
  createdAt:   column.timestamp().notNull().defaultNow(),
});
