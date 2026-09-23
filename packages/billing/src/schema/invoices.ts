import { defineTable, column } from '@mariachi/database';

export const billingInvoicesTable = defineTable('billing_invoices', {
  id:             column.text().primaryKey(),
  tenantId:       column.text(),
  customerId:     column.text().notNull().index(),
  subscriptionId: column.text(),
  number:         column.text(),
  amountDue:      column.bigint().notNull(),
  amountPaid:     column.bigint().notNull(),
  currency:       column.varchar(3).notNull(),
  status:         column.text().notNull(),
  hostedUrl:      column.text(),
  pdfUrl:         column.text(),
  periodStart:    column.timestamp(),
  periodEnd:      column.timestamp(),
  paidAt:         column.timestamp(),
  lastEventAt:    column.timestamp().notNull(),
  createdAt:      column.timestamp().notNull().defaultNow(),
  updatedAt:      column.timestamp().notNull().defaultNow(),
});
