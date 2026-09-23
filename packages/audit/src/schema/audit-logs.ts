import { defineTable, column, index } from '@mariachi/database';

/**
 * Append-only audit trail. Install `AUDIT_APPEND_ONLY_SQL` (or call `installAuditAppendOnly`) so the
 * database itself rejects UPDATE and DELETE.
 */
export const auditLogsTable = defineTable(
  'audit_logs',
  {
    id:         column.uuid().primaryKey().defaultRandom(),
    actor:      column.text().notNull(),
    action:     column.text().notNull(),
    resource:   column.text().notNull(),
    resourceId: column.text().notNull(),
    tenantId:   column.text(),
    ipAddress:  column.text(),
    userAgent:  column.text(),
    occurredAt: column.timestamp().notNull().defaultNow(),
    metadata:   column.json(),
    /** Previous row's entryHash. Null when chaining is off. */
    prevHash:   column.text(),
    entryHash:  column.text().notNull().default(''),
    /** 1, 2, 3... per tenant when chaining. Assigned under an advisory lock. */
    chainSeq:   column.bigint(),
  },
  {
    indexes: [
      index('audit_logs_tenant_occurred_idx').on('tenantId', 'occurredAt'),
      index('audit_logs_resource_idx').on('resource', 'resourceId'),
      index('audit_logs_chain_uniq').on('tenantId', 'chainSeq').unique().where('chain_seq IS NOT NULL'),
    ],
  },
);
