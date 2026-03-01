import { defineTable, column } from '@mariachi/database';

export const notificationsTable = defineTable('notifications', {
  id:        column.uuid().primaryKey().defaultRandom(),
  tenantId:  column.text().notNull(),
  userId:    column.text().notNull(),
  type:      column.text().notNull(),
  channel:   column.text().notNull(),
  title:     column.text().notNull(),
  body:      column.text().notNull(),
  read:      column.boolean().notNull().default(false),
  metadata:  column.json(),
  createdAt: column.timestamp().notNull().defaultNow(),
  readAt:    column.timestamp(),
});
