import { createCommunication } from '@mariachi/communication';
import { registerUsersHandlers } from './users/users.handler';

export function registerServiceHandlers(communication: ReturnType<typeof createCommunication>) {
  registerUsersHandlers(communication);
}
