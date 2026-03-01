// Adapter & factory
export { PostgresAdapter } from './adapter';
export { createPostgresDatabase, createDatabase } from './client';
export type { DrizzleInstance } from './client';

// Compiler
export { compileTable } from './compiler';

// Repository
export { DrizzleRepository } from './repositories/drizzle.repository';
export type { DrizzleRepositoryOptions } from './repositories/drizzle.repository';
export { DrizzleUsersRepository, LegacyUsersRepository as UsersRepository } from './repositories/users.repository';
export type { User } from './repositories/users.repository';

/** @deprecated Use `DrizzleRepository` instead. */
export { DrizzleRepository as BaseRepository } from './repositories/drizzle.repository';
/** @deprecated Use `DrizzleRepositoryOptions` instead. */
export type { DrizzleRepositoryOptions as BaseRepositoryOptions } from './repositories/drizzle.repository';

// Compiled schemas (all 24 tables)
export {
  users,
  tenants,
  roles,
  permissions,
  userRoles,
  apiKeys,
  sessions,
  billingCustomers,
  billingSubscriptions,
  billingCharges,
  billingRefunds,
  billingCreditTransactions,
  billingUsageRecords,
  billingWebhookEvents,
  billingPlans,
  aiSessions,
  aiMessages,
  aiTelemetry,
  notifications,
  notificationPreferences,
  notificationDeliveries,
  featureFlags,
  auditLogs,
  webhookLogs,
} from './compiled-schemas';

// Seed
export { runSeed } from './seed/index';
