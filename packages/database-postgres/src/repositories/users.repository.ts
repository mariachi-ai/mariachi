import type { Context } from '@mariachi/core';
import type { UsersRepository, User } from '@mariachi/database';
import { users } from '../compiled-schemas';
import { DrizzleRepository } from './drizzle.repository';

export type { User };

export class DrizzleUsersRepository extends DrizzleRepository<User> implements UsersRepository {
  constructor(db: import('drizzle-orm/postgres-js').PostgresJsDatabase<Record<string, never>>) {
    super(users, db, { tenantColumn: 'tenantId' });
  }

  async findByEmail(ctx: Context, email: string): Promise<User | null> {
    const rows = await this.findMany(ctx, { email } as Partial<User>);
    return rows[0] ?? null;
  }
}

/** @deprecated Use `DrizzleUsersRepository` instead. */
export { DrizzleUsersRepository as LegacyUsersRepository };
