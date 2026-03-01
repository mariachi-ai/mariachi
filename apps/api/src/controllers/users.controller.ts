import { z } from 'zod';
import { BaseController, type HttpContext } from '@mariachi/api-facade';
import { createCommunication } from '@mariachi/communication';

const CreateUserInput = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  tenantId: z.string(),
});

const GetUserInput = z.object({
  userId: z.string(),
});

const communication = createCommunication();

export class UsersController extends BaseController {
  readonly prefix = 'users';

  init() {
    this.post(this.buildPath(), this.create);
    this.get(this.buildPath(':id'), this.getById);
  }

  create = async (ctx: HttpContext, body: unknown) => {
    const input = CreateUserInput.parse(body);
    return communication.call('users.create', ctx, input);
  };

  getById = async (ctx: HttpContext, _body: unknown, params: Record<string, string>) => {
    const input = GetUserInput.parse({ userId: params.id });
    return communication.call('users.getById', ctx, input);
  };
}
