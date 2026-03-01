import { defineTable } from '../table';
import { column } from '../column';

export const usersTable = defineTable('users', {
  id:        column.uuid().primaryKey().defaultRandom(),
  tenantId:  column.text().notNull(),
  email:     column.text().notNull(),
  name:      column.text(),
  createdAt: column.timestamp().notNull().defaultNow(),
  updatedAt: column.timestamp().notNull().defaultNow(),
  deletedAt: column.timestamp(),
});
