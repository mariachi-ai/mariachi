/**
 * Every framework table definition, backend-agnostic. Each import targets the package's
 * dependency-free `./schema` subpath, so this pulls in no vendor SDKs.
 * Compile with `compileSchema()` from `@mariachi/database-postgres`.
 */

export { usersTable, tenantsTable } from '@mariachi/database/schema';

export {
  rolesTable,
  permissionsTable,
  userRolesTable,
  apiKeysTable,
  sessionsTable,
} from '@mariachi/auth/schema';

export {
  billingCustomersTable,
  billingSubscriptionsTable,
  billingChargesTable,
  billingRefundsTable,
  billingCreditTransactionsTable,
  billingUsageRecordsTable,
  billingWebhookEventsTable,
  billingPlansTable,
} from '@mariachi/billing/schema';

export { aiSessionsTable, aiMessagesTable, aiTelemetryTable } from '@mariachi/ai/schema';

export {
  notificationsTable,
  notificationPreferencesTable,
  notificationDeliveriesTable,
} from '@mariachi/notifications/schema';

export { featureFlagsTable } from '@mariachi/config/schema';

export { auditLogsTable } from '@mariachi/audit/schema';

export { webhookLogsTable } from '@mariachi/webhooks/schema';
