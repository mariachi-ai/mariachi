import { z } from 'zod';
import { BaseController, type HttpContext } from '@mariachi/api-facade';
import { getContainer, KEYS } from '@mariachi/core';
import type { CommunicationLayer } from '@mariachi/communication';

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

const GetUserSchema = z.object({
  id: z.string().uuid(),
});

export class UsersController extends BaseController {
  readonly prefix = 'users';

  init() {
    this.post(this.buildPath(), this.create);
    this.get(this.buildPath(':id'), this.getById);
    this.get(this.buildPath(), this.list);
  }

  create = async (ctx: HttpContext, body: unknown) => {
    const input = CreateUserSchema.parse(body);
    const communication = getContainer().resolve<CommunicationLayer>(KEYS.Communication);
    const result = await communication.call('users.create', ctx, input);
    return { status: 201, body: result };
  };

  getById = async (ctx: HttpContext, _body: unknown, params: Record<string, string>) => {
    const { id } = GetUserSchema.parse(params);
    const communication = getContainer().resolve<CommunicationLayer>(KEYS.Communication);
    const result = await communication.call('users.getById', ctx, { id });
    if (!result) return { status: 404, body: { error: 'User not found' } };
    return { status: 200, body: result };
  };

  list = async (ctx: HttpContext, _body: unknown, _params: Record<string, string>, query: Record<string, string>) => {
    const pagination = z.object({
      page: z.coerce.number().default(1),
      pageSize: z.coerce.number().default(20),
    }).parse(query);
    const communication = getContainer().resolve<CommunicationLayer>(KEYS.Communication);
    const result = await communication.call('users.list', ctx, pagination);
    return { status: 200, body: result };
  };
}
