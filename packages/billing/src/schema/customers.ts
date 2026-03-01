import { defineTable, column } from '@mariachi/database';

export const billingCustomersTable = defineTable('billing_customers', {
  id:         column.uuid().primaryKey().defaultRandom(),
  tenantId:   column.text().notNull(),
  externalId: column.text().notNull(),
  email:      column.text().notNull(),
  name:       column.text(),
  status:     column.text().notNull().default('active'),
  metadata:   column.json(),
  createdAt:  column.timestamp().notNull().defaultNow(),
  updatedAt:  column.timestamp().notNull().defaultNow(),
  deletedAt:  column.timestamp(),
});
