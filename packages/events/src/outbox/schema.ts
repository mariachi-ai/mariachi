import { column, defineTable, index } from '@mariachi/database';

/** Transactional outbox. Rows are written in the business transaction and relayed to the bus. */
export const eventOutboxTable = defineTable(
  'mariachi_event_outbox',
  {
    id:          column.uuid().primaryKey(),
    type:        column.text().notNull(),
    envelope:    column.json().notNull(),
    attempts:    column.integer().notNull().default(0),
    lastError:   column.text(),
    availableAt: column.timestamp().notNull().defaultNow(),
    publishedAt: column.timestamp(),
    createdAt:   column.timestamp().notNull().defaultNow(),
  },
  {
    indexes: [
      index('mariachi_event_outbox_pending_idx').on('availableAt').where('published_at IS NULL'),
      index('mariachi_event_outbox_published_idx').on('publishedAt').where('published_at IS NOT NULL'),
    ],
  },
);
