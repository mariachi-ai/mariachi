/**
 * Backend-agnostic re-export of all framework table definitions.
 * No Drizzle or Postgres; use compileTable from @mariachi/database-postgres
 * in your app (or optional @mariachi/schema-postgres) to get Drizzle tables.
 */

// Database (core)
export { usersTable, tenantsTable } from '@mariachi/database';

// Auth
export {
  rolesTable,
  permissionsTable,
  userRolesTable,
  apiKeysTable,
  sessionsTable,
} from '@mariachi/auth';

// Billing
export {
  billingCustomersTable,
  billingSubscriptionsTable,
  billingChargesTable,
  billingRefundsTable,
  billingCreditTransactionsTable,
  billingUsageRecordsTable,
  billingWebhookEventsTable,
  billingPlansTable,
} from '@mariachi/billing';

// AI
export { aiSessionsTable, aiMessagesTable, aiTelemetryTable } from '@mariachi/ai';

// Notifications
export {
  notificationsTable,
  notificationPreferencesTable,
  notificationDeliveriesTable,
} from '@mariachi/notifications';

// Config
export { featureFlagsTable } from '@mariachi/config';

// Audit
export { auditLogsTable } from '@mariachi/audit';

// Webhooks
export { webhookLogsTable } from '@mariachi/webhooks';
