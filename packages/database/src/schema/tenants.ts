import { defineTable } from '../table';
import { column } from '../column';

export const tenantsTable = defineTable('tenants', {
  id: column.uuid().primaryKey().defaultRandom(),
  name: column.text().notNull(),
  slug: column.text().notNull().unique(),
  status: column.enum(['active', 'suspended', 'deleted'], { enumName: 'tenant_status' }).notNull().default('active'),
  plan: column.text(),
  metadata: column.json().$type<Record<string, unknown>>(),
  createdAt: column.timestamp().notNull().defaultNow(),
  updatedAt: column.timestamp().notNull().defaultNow(),
  deletedAt: column.timestamp(),
});
