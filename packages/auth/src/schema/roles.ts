import { defineTable, column } from '@mariachi/database';

export const rolesTable = defineTable('roles', {
  id:          column.uuid().primaryKey().defaultRandom(),
  name:        column.text().notNull().unique(),
  description: column.text(),
  permissions: column.json().notNull().default([]),
  createdAt:   column.timestamp().notNull().defaultNow(),
  updatedAt:   column.timestamp().notNull().defaultNow(),
});
