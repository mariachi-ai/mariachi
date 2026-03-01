import { createCommunication } from '@mariachi/communication';
import { UsersService, CreateUserInput, GetUserInput } from './users.service';
import { z } from 'zod';

const UserOutput = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  tenantId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});

export function registerUsersHandlers(communication: ReturnType<typeof createCommunication>) {
  communication.register('users.create', {
    schema: { input: CreateUserInput, output: UserOutput },
    handler: (ctx, input) => UsersService.create(ctx, input),
  });
  communication.register('users.getById', {
    schema: { input: GetUserInput, output: UserOutput },
    handler: (ctx, input) => UsersService.getById(ctx, input),
  });
}
