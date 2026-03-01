import { defineTable, column } from '@mariachi/database';

export const userRolesTable = defineTable('user_roles', {
  id:        column.uuid().primaryKey().defaultRandom(),
  userId:    column.text().notNull(),
  tenantId:  column.text().notNull(),
  roleId:    column.uuid().notNull(),
  createdAt: column.timestamp().notNull().defaultNow(),
});
