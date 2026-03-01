import { defineTable, column } from '@mariachi/database';

export const billingUsageRecordsTable = defineTable('billing_usage_records', {
  id:             column.uuid().primaryKey().defaultRandom(),
  tenantId:       column.text().notNull(),
  customerId:     column.uuid().notNull(),
  metricName:     column.text().notNull(),
  quantity:       column.integer().notNull(),
  timestamp:      column.timestamp().notNull(),
  idempotencyKey: column.text(),
  metadata:       column.json(),
  createdAt:      column.timestamp().notNull().defaultNow(),
});
