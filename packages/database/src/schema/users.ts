import { defineTable } from '../table';
import { column, index } from '../column';

export const usersTable = defineTable(
  'users',
  {
    id: column.uuid().primaryKey().defaultRandom(),
    tenantId: column.text().notNull(),
    email: column.text().notNull(),
    name: column.text(),
    createdAt: column.timestamp().notNull().defaultNow(),
    updatedAt: column.timestamp().notNull().defaultNow(),
    deletedAt: column.timestamp(),
  },
  { indexes: [index('users_tenant_email_uniq').on('tenantId', 'email').unique().where('deleted_at IS NULL')] },
);
