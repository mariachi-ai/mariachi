import { compileTable } from './compiler';

import { usersTable, tenantsTable } from '@mariachi/database';
import { rolesTable, permissionsTable, userRolesTable, apiKeysTable, sessionsTable } from '@mariachi/auth';
import {
  billingCustomersTable,
  billingSubscriptionsTable,
  billingChargesTable,
  billingRefundsTable,
  billingCreditTransactionsTable,
  billingUsageRecordsTable,
  billingWebhookEventsTable,
  billingPlansTable,
} from '@mariachi/billing';
import { aiSessionsTable, aiMessagesTable, aiTelemetryTable } from '@mariachi/ai';
import { notificationsTable, notificationPreferencesTable, notificationDeliveriesTable } from '@mariachi/notifications';
import { featureFlagsTable } from '@mariachi/config';
import { auditLogsTable } from '@mariachi/audit';
import { webhookLogsTable } from '@mariachi/webhooks';

export const users = compileTable(usersTable);
export const tenants = compileTable(tenantsTable);

export const roles = compileTable(rolesTable);
export const permissions = compileTable(permissionsTable);
export const userRoles = compileTable(userRolesTable);
export const apiKeys = compileTable(apiKeysTable);
export const sessions = compileTable(sessionsTable);

export const billingCustomers = compileTable(billingCustomersTable);
export const billingSubscriptions = compileTable(billingSubscriptionsTable);
export const billingCharges = compileTable(billingChargesTable);
export const billingRefunds = compileTable(billingRefundsTable);
export const billingCreditTransactions = compileTable(billingCreditTransactionsTable);
export const billingUsageRecords = compileTable(billingUsageRecordsTable);
export const billingWebhookEvents = compileTable(billingWebhookEventsTable);
export const billingPlans = compileTable(billingPlansTable);

export const aiSessions = compileTable(aiSessionsTable);
export const aiMessages = compileTable(aiMessagesTable);
export const aiTelemetry = compileTable(aiTelemetryTable);

export const notifications = compileTable(notificationsTable);
export const notificationPreferences = compileTable(notificationPreferencesTable);
export const notificationDeliveries = compileTable(notificationDeliveriesTable);

export const featureFlags = compileTable(featureFlagsTable);

export const auditLogs = compileTable(auditLogsTable);

export const webhookLogs = compileTable(webhookLogsTable);
