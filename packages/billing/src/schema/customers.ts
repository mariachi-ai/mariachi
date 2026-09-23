import { defineTable, column, index } from '@mariachi/database';

/** Local mirror of provider customers, one per tenant. `id` is the provider id (`cus_...`). */
export const billingCustomersTable = defineTable(
  'billing_customers',
  {
    id:          column.text().primaryKey(),
    tenantId:    column.text(),
    email:       column.text(),
    name:        column.text(),
    delinquent:  column.boolean().notNull().default(false),
    metadata:    column.json().$type<Record<string, string>>(),
    lastEventAt: column.timestamp().notNull(),
    createdAt:   column.timestamp().notNull().defaultNow(),
    updatedAt:   column.timestamp().notNull().defaultNow(),
    deletedAt:   column.timestamp(),
  },
  { indexes: [index('billing_customers_tenant_uniq').on('tenantId').unique().where('deleted_at IS NULL')] },
);
