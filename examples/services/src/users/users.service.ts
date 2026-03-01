import { z } from 'zod';
import type { Context, PaginationParams, PaginatedResult } from '@mariachi/core';
import { getContainer, KEYS, DatabaseError } from '@mariachi/core';
import { withSpan } from '@mariachi/core';
import type { TracerAdapter } from '@mariachi/core';
import type { EventBus } from '@mariachi/events';
import type { CacheClient } from '@mariachi/cache';

export const CreateUserInput = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  tenantId: z.string(),
});

export const UserOutput = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  tenantId: z.string(),
  createdAt: z.date(),
});

export type CreateUserInput = z.infer<typeof CreateUserInput>;
export type UserOutput = z.infer<typeof UserOutput>;

export class UsersService {
  async create(ctx: Context, input: CreateUserInput): Promise<UserOutput> {
    const tracer = getContainer().has(KEYS.Tracer) ? getContainer().resolve<TracerAdapter>(KEYS.Tracer) : undefined;

    return withSpan(tracer, 'UsersService.create', { email: input.email }, async () => {
      ctx.logger.info({ email: input.email, tenantId: input.tenantId }, 'Creating user');

      // In a real app: insert into database via repository
      const user: UserOutput = {
        id: crypto.randomUUID(),
        email: input.email,
        name: input.name,
        tenantId: input.tenantId,
        createdAt: new Date(),
      };

      // Publish domain event
      if (getContainer().has(KEYS.EventBus)) {
        const events = getContainer().resolve<EventBus>(KEYS.EventBus);
        await events.publish('users.created', {
          userId: user.id,
          email: user.email,
          tenantId: user.tenantId,
        });
      }

      // Invalidate cache
      if (getContainer().has(KEYS.Cache)) {
        const cache = getContainer().resolve<CacheClient>(KEYS.Cache);
        await cache.del(`users:list:${input.tenantId}`);
      }

      ctx.logger.info({ userId: user.id }, 'User created');
      return user;
    });
  }

  async getById(ctx: Context, id: string): Promise<UserOutput | null> {
    const tracer = getContainer().has(KEYS.Tracer) ? getContainer().resolve<TracerAdapter>(KEYS.Tracer) : undefined;

    return withSpan(tracer, 'UsersService.getById', { userId: id }, async () => {
      // Check cache first
      if (getContainer().has(KEYS.Cache)) {
        const cache = getContainer().resolve<CacheClient>(KEYS.Cache);
        const cached = await cache.get<UserOutput>(`users:${id}`);
        if (cached) {
          ctx.logger.debug({ userId: id }, 'User found in cache');
          return cached;
        }
      }

      // In a real app: query database via repository
      ctx.logger.info({ userId: id }, 'Looking up user in database');
      return null; // placeholder
    });
  }
}
