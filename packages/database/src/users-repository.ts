import type { Context } from '@mariachi/core';
import type { InferEntity } from './schema';
import type { Repository } from './types';
import type { usersTable } from './schema/users';

export type User = InferEntity<typeof usersTable>;

export interface UsersRepository extends Repository<User> {
  findByEmail(ctx: Context, email: string): Promise<User | null>;
}
