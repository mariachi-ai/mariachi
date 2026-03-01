import { defineTable, column } from '@mariachi/database';

export const notificationPreferencesTable = defineTable('notification_preferences', {
  id:        column.uuid().primaryKey().defaultRandom(),
  tenantId:  column.text().notNull(),
  userId:    column.text().notNull(),
  channel:   column.text().notNull(),
  category:  column.text().notNull(),
  enabled:   column.boolean().notNull().default(true),
  updatedAt: column.timestamp().notNull().defaultNow(),
});
