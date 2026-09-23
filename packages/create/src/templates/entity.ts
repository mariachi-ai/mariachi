import type { Names } from '../names';

/** Files for a full vertical slice (table → repository → service → handlers → controller → test). */
export function entityFiles(n: Names): Record<string, string> {
  const dir = `src/services/${n.pluralKebab}`;
  return {
    [`src/schema/${n.pluralKebab}.ts`]: schema(n),
    [`src/contracts/${n.pluralKebab}.ts`]: contracts(n),
    [`${dir}/${n.pluralKebab}.repository.ts`]: repository(n),
    [`${dir}/${n.pluralKebab}.service.ts`]: service(n),
    [`${dir}/${n.pluralKebab}.handler.ts`]: handler(n),
    [`${dir}/${n.pluralKebab}.service.test.ts`]: serviceTest(n),
    [`src/api/controllers/${n.pluralKebab}.controller.ts`]: controller(n),
  };
}

const schema = (n: Names) => `import { column, defineTable, type InferEntity } from '@mariachi/database';

/** Tenant-scoped (tenantId) and soft-deleted (deletedAt); repositories enforce both. */
export const ${n.pluralCamel}Table = defineTable('${n.pluralSnake}', {
  id: column.uuid().primaryKey().defaultRandom(),
  tenantId: column.text().notNull(),
  name: column.text().notNull(),
  createdAt: column.timestamp().notNull().defaultNow(),
  updatedAt: column.timestamp().notNull().defaultNow(),
  deletedAt: column.timestamp(),
});

export type ${n.pascal} = InferEntity<typeof ${n.pluralCamel}Table>;
`;

const contracts = (n: Names) => `import { z } from 'zod';

export const ${n.camel}Schema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const create${n.pascal}Input = z.object({
  name: z.string().trim().min(1).max(200),
});

export const update${n.pascal}Body = create${n.pascal}Input.partial();

export const update${n.pascal}Input = update${n.pascal}Body.extend({ id: z.string().uuid() });

export const ${n.camel}IdInput = z.object({ id: z.string().uuid() });

export const list${n.pluralPascal}Input = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const ${n.camel}ListSchema = z.object({
  data: z.array(${n.camel}Schema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export type ${n.pascal}Dto = z.infer<typeof ${n.camel}Schema>;
export type ${n.pascal}List = z.infer<typeof ${n.camel}ListSchema>;
export type Create${n.pascal}Input = z.infer<typeof create${n.pascal}Input>;
export type Update${n.pascal}Input = z.infer<typeof update${n.pascal}Input>;
export type List${n.pluralPascal}Input = z.infer<typeof list${n.pluralPascal}Input>;

declare module '@mariachi/communication' {
  interface Procedures {
    '${n.pluralCamel}.create': { input: Create${n.pascal}Input; output: ${n.pascal}Dto };
    '${n.pluralCamel}.get': { input: z.infer<typeof ${n.camel}IdInput>; output: ${n.pascal}Dto };
    '${n.pluralCamel}.list': { input: z.input<typeof list${n.pluralPascal}Input>; output: ${n.pascal}List };
    '${n.pluralCamel}.update': { input: Update${n.pascal}Input; output: ${n.pascal}Dto };
    '${n.pluralCamel}.delete': { input: z.infer<typeof ${n.camel}IdInput>; output: void };
  }
}
`;

const repository = (n: Names) => `import { DrizzleRepository, type DrizzleDb } from '@mariachi/database-postgres';
import { ${n.pluralCamel}Table, type ${n.pascal} } from '../../schema/${n.pluralKebab}';

export class ${n.pluralPascal}Repository extends DrizzleRepository<${n.pascal}> {
  constructor(db: DrizzleDb) {
    super(${n.pluralCamel}Table, db);
  }
}
`;

const service = (n: Names) => `import type { Context, CursorPaginatedResult } from '@mariachi/core';
import type { Create${n.pascal}Input, List${n.pluralPascal}Input, Update${n.pascal}Input } from '../../contracts/${n.pluralKebab}';
import type { ${n.pascal} } from '../../schema/${n.pluralKebab}';
import type { ${n.pluralPascal}Repository } from './${n.pluralKebab}.repository';

export class ${n.pluralPascal}Service {
  constructor(private readonly ${n.pluralCamel}: ${n.pluralPascal}Repository) {}

  create(ctx: Context, input: Create${n.pascal}Input): Promise<${n.pascal}> {
    return this.${n.pluralCamel}.create(ctx, { name: input.name });
  }

  get(ctx: Context, id: string): Promise<${n.pascal}> {
    return this.${n.pluralCamel}.getById(ctx, id);
  }

  list(ctx: Context, input: List${n.pluralPascal}Input): Promise<CursorPaginatedResult<${n.pascal}>> {
    return this.${n.pluralCamel}.paginateCursor(ctx, { limit: input.limit, cursor: input.cursor });
  }

  update(ctx: Context, input: Update${n.pascal}Input): Promise<${n.pascal}> {
    const { id, ...patch } = input;
    return this.${n.pluralCamel}.update(ctx, id, patch);
  }

  async remove(ctx: Context, id: string): Promise<void> {
    await this.${n.pluralCamel}.softDelete(ctx, id);
  }
}
`;

const handler = (n: Names) => `import type { CommunicationLayer } from '@mariachi/communication';
import { z } from 'zod';
import {
  ${n.camel}IdInput,
  ${n.camel}ListSchema,
  ${n.camel}Schema,
  create${n.pascal}Input,
  list${n.pluralPascal}Input,
  update${n.pascal}Input,
} from '../../contracts/${n.pluralKebab}';
import type { ${n.pluralPascal}Service } from './${n.pluralKebab}.service';

export function register${n.pluralPascal}Handlers(communication: CommunicationLayer, service: ${n.pluralPascal}Service): void {
  communication.register('${n.pluralCamel}.create', {
    schema: { input: create${n.pascal}Input, output: ${n.camel}Schema },
    handler: (ctx, input) => service.create(ctx, input),
  });
  communication.register('${n.pluralCamel}.get', {
    schema: { input: ${n.camel}IdInput, output: ${n.camel}Schema },
    handler: (ctx, input) => service.get(ctx, input.id),
  });
  communication.register('${n.pluralCamel}.list', {
    schema: { input: list${n.pluralPascal}Input, output: ${n.camel}ListSchema },
    handler: (ctx, input) => service.list(ctx, input),
  });
  communication.register('${n.pluralCamel}.update', {
    schema: { input: update${n.pascal}Input, output: ${n.camel}Schema },
    handler: (ctx, input) => service.update(ctx, input),
  });
  communication.register('${n.pluralCamel}.delete', {
    schema: { input: ${n.camel}IdInput, output: z.void() },
    handler: (ctx, input) => service.remove(ctx, input.id),
  });
}
`;

const serviceTest = (n: Names) => `import { describe, expect, it, vi } from 'vitest';
import { createContext, type Logger } from '@mariachi/core';
import type { ${n.pluralPascal}Repository } from './${n.pluralKebab}.repository';
import { ${n.pluralPascal}Service } from './${n.pluralKebab}.service';

const logger = { debug() {}, info() {}, warn() {}, error() {}, child: () => logger } as unknown as Logger;
const ctx = createContext({ logger, tenantId: 'tenant-1', userId: 'user-1' });

function setup() {
  const repo = {
    create: vi.fn(async (_ctx: unknown, data: { name: string }) => ({ id: 'id-1', tenantId: 'tenant-1', ...data })),
    update: vi.fn(async (_ctx: unknown, id: string, data: object) => ({ id, ...data })),
    softDelete: vi.fn(async () => undefined),
  };
  return { repo, service: new ${n.pluralPascal}Service(repo as unknown as ${n.pluralPascal}Repository) };
}

describe('${n.pluralPascal}Service', () => {
  it('creates within the caller context', async () => {
    const { repo, service } = setup();
    const created = await service.create(ctx, { name: 'First' });
    expect(created).toMatchObject({ id: 'id-1', name: 'First' });
    expect(repo.create).toHaveBeenCalledWith(ctx, { name: 'First' });
  });

  it('updates only the provided fields', async () => {
    const { repo, service } = setup();
    await service.update(ctx, { id: 'id-1', name: 'Renamed' });
    expect(repo.update).toHaveBeenCalledWith(ctx, 'id-1', { name: 'Renamed' });
  });

  it('soft deletes', async () => {
    const { repo, service } = setup();
    await service.remove(ctx, 'id-1');
    expect(repo.softDelete).toHaveBeenCalledWith(ctx, 'id-1');
  });
});
`;

const controller = (n: Names) => `import { BaseController } from '@mariachi/api-facade';
import {
  ${n.camel}IdInput,
  ${n.camel}ListSchema,
  ${n.camel}Schema,
  create${n.pascal}Input,
  list${n.pluralPascal}Input,
  update${n.pascal}Body,
  type ${n.pascal}Dto,
  type ${n.pascal}List,
} from '../../contracts/${n.pluralKebab}';

/** Thin HTTP layer: Zod validates the request, then a procedure does the work. */
export class ${n.pluralPascal}Controller extends BaseController {
  readonly prefix = '${n.pluralKebab}';
  readonly tags = ['${n.pluralKebab}'];

  init(): void {
    this.post(
      '/',
      { schema: { body: create${n.pascal}Input, response: ${n.camel}Schema }, status: 201, summary: 'Create a ${n.kebab.replace(/-/g, ' ')}' },
      (ctx, body) => this.call<${n.pascal}Dto>(ctx, '${n.pluralCamel}.create', body),
    );
    this.get(
      '/',
      { schema: { query: list${n.pluralPascal}Input, response: ${n.camel}ListSchema }, summary: 'List ${n.pluralKebab.replace(/-/g, ' ')}' },
      (ctx, _body, _params, query) => this.call<${n.pascal}List>(ctx, '${n.pluralCamel}.list', query),
    );
    this.get('/:id', { schema: { params: ${n.camel}IdInput, response: ${n.camel}Schema } }, (ctx, _body, params) =>
      this.call<${n.pascal}Dto>(ctx, '${n.pluralCamel}.get', params),
    );
    this.patch('/:id', { schema: { params: ${n.camel}IdInput, body: update${n.pascal}Body, response: ${n.camel}Schema } }, (ctx, body, params) =>
      this.call<${n.pascal}Dto>(ctx, '${n.pluralCamel}.update', { ...body, id: params.id }),
    );
    this.delete('/:id', { schema: { params: ${n.camel}IdInput } }, async (ctx, _body, params) => {
      await this.call(ctx, '${n.pluralCamel}.delete', params);
      return undefined;
    });
  }
}
`;
