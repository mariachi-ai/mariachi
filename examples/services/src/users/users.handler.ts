import type { CommunicationLayer } from '@mariachi/communication';
import { UsersService, CreateUserInput } from './users.service';

const usersService = new UsersService();

export function registerUsersHandlers(communication: CommunicationLayer) {
  communication.register('users.create', {
    schema: { input: CreateUserInput, output: CreateUserInput },
    handler: async (ctx, input) => {
      return usersService.create(ctx, input);
    },
  });

  communication.register('users.getById', {
    schema: { input: CreateUserInput, output: CreateUserInput },
    handler: async (ctx, input: any) => {
      return usersService.getById(ctx, input.id);
    },
  });
}
