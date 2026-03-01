import { defineTable } from '../table';
import { column } from '../column';

export const tenantsTable = defineTable('tenants', {
  id:        column.uuid().primaryKey().defaultRandom(),
  name:      column.text().notNull(),
  slug:      column.text().notNull().unique(),
  plan:      column.text(),
  createdAt: column.timestamp().notNull().defaultNow(),
  updatedAt: column.timestamp().notNull().defaultNow(),
  deletedAt: column.timestamp(),
});
