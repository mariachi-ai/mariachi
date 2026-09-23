import type { Context } from '@mariachi/core';
import { usersTable, type UsersRepository, type User } from '@mariachi/database';
import { DrizzleRepository } from './drizzle.repository';
import type { DrizzleDb } from '../transaction';

export type { User };

export class DrizzleUsersRepository extends DrizzleRepository<User> implements UsersRepository {
  constructor(db: DrizzleDb) {
    super(usersTable, db);
  }

  findByEmail(ctx: Context, email: string): Promise<User | null> {
    return this.findOne(ctx, { email });
  }
}

/** @deprecated Use `DrizzleUsersRepository` instead. */
export { DrizzleUsersRepository as LegacyUsersRepository };
