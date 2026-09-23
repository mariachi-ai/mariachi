import { defineTable, column, index } from '@mariachi/database';

/** One row per notification and channel; `attemptCount` grows with retries. */
export const notificationDeliveriesTable = defineTable(
  'notification_deliveries',
  {
  id:               column.uuid().primaryKey().defaultRandom(),
  notificationId:   column.uuid().notNull(),
  tenantId:         column.text().notNull(),
  userId:           column.text().notNull(),
  channel:          column.text().notNull(),
  status:           column.text().notNull().default('queued'),
  externalId:       column.text(),
  error:            column.text(),
  attemptCount:     column.integer().notNull().default(0),
  sentAt:           column.timestamp(),
  deliveredAt:      column.timestamp(),
  createdAt:        column.timestamp().notNull().defaultNow(),
  updatedAt:        column.timestamp().notNull().defaultNow(),
  },
  {
    indexes: [
      index('notification_deliveries_uniq').on('notificationId', 'channel').unique(),
      index('notification_deliveries_external_idx').on('externalId'),
    ],
  },
);
