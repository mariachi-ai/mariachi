import { ConflictError, DatabaseError, MariachiError } from '@mariachi/core';

interface PgError {
  code?: string;
  constraint_name?: string;
  constraint?: string;
  table_name?: string;
  column_name?: string;
  detail?: string;
  message?: string;
}

/** True for errors raised by the Postgres driver (directly or wrapped by drizzle). */
export function isPgError(error: unknown): boolean {
  const candidates = [error, (error as { cause?: unknown })?.cause];
  return candidates.some(
    (e) => !!e && typeof e === 'object' && ((e as { name?: string }).name === 'PostgresError' || typeof (e as { severity?: unknown }).severity === 'string'),
  );
}

/** Maps Postgres SQLSTATE codes to typed errors so HTTP status and retries behave correctly. */
export function mapPgError(error: unknown, operation: string): MariachiError {
  if (error instanceof MariachiError) return error;
  const e = ((error as { cause?: unknown })?.cause ?? error) as PgError;
  const meta = {
    operation,
    constraint: e.constraint_name ?? e.constraint,
    table: e.table_name,
    column: e.column_name,
    pgCode: e.code,
  };
  switch (e.code) {
    case '23505':
      return new ConflictError(`Duplicate value violates ${meta.constraint ?? 'a unique constraint'}`, meta);
    case '23503':
      return new DatabaseError('database/foreign-key-violation', 'Referenced row does not exist or is still referenced', meta);
    case '23502':
      return new DatabaseError('database/invalid-input', `Column ${meta.column ?? ''} cannot be null`.trim(), meta);
    case '23514':
      return new DatabaseError('database/invalid-input', `Check constraint ${meta.constraint ?? ''} failed`.trim(), meta);
    case '22P02':
      return new DatabaseError('database/invalid-input', 'Invalid input syntax', meta);
    case '40001':
    case '40P01':
      return new DatabaseError('database/serialization-failure', 'Transaction conflict; retry', { ...meta, retryable: true });
    case '57014':
      return new DatabaseError('database/timeout', 'Statement timed out', meta);
    default:
      return new DatabaseError('database/query-failed', `Database ${operation} failed`, { ...meta, cause: error });
  }
}
