import type { Context } from '@mariachi/core';
import { z } from 'zod';

export const CreateUserInput = z.object({ email: z.string().email(), name: z.string(), tenantId: z.string() });
export const GetUserInput = z.object({ userId: z.string() });

export const UsersService = {
  create: async (ctx: Context, input: z.infer<typeof CreateUserInput>) => {
    ctx.logger.info({ email: input.email }, 'Creating user');
    return { id: crypto.randomUUID(), ...input, createdAt: new Date(), updatedAt: new Date(), deletedAt: null };
  },
  getById: async (ctx: Context, input: z.infer<typeof GetUserInput>) => {
    ctx.logger.info({ userId: input.userId }, 'Fetching user');
    return { id: input.userId, email: 'user@example.com', name: 'Example User', tenantId: 'tenant-1', createdAt: new Date(), updatedAt: new Date(), deletedAt: null };
  },
};
