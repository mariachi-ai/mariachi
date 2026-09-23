export { PostgresAdapter } from './adapter';
export { createPostgresDatabase, createDatabase, type DrizzleInstance, type PostgresDatabase } from './client';

export { compileTable, compileSchema, compiledEnums } from './compiler';
export { withTransaction, currentTransaction, type TransactionOptions, type DrizzleDb } from './transaction';
export { mapPgError, isPgError } from './errors';
export { runMigrations, runSeeds, runSeed, type RunSeedsOptions } from './migrate';
export { schemaSql, applySchema, toDrizzleImports } from './schema-sql';

export { DrizzleRepository } from './repositories/drizzle.repository';
export type { DrizzleRepositoryOptions } from './repositories/drizzle.repository';
export { DrizzleUsersRepository, LegacyUsersRepository as UsersRepository } from './repositories/users.repository';
export type { User } from './repositories/users.repository';

/** @deprecated Use `DrizzleRepository` instead. */
export { DrizzleRepository as BaseRepository } from './repositories/drizzle.repository';
/** @deprecated Use `DrizzleRepositoryOptions` instead. */
export type { DrizzleRepositoryOptions as BaseRepositoryOptions } from './repositories/drizzle.repository';

export { users, tenants } from './compiled-schemas';
