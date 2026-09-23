import type { Names } from '../names';

export function serviceFiles(n: Names): Record<string, string> {
  const dir = `src/services/${n.kebab}`;
  return {
    [`src/contracts/${n.kebab}.ts`]: serviceContracts(n),
    [`${dir}/${n.kebab}.service.ts`]: service(n),
    [`${dir}/${n.kebab}.handler.ts`]: serviceHandler(n),
    [`${dir}/${n.kebab}.service.test.ts`]: serviceTest(n),
  };
}

const serviceContracts = (n: Names) => `import { z } from 'zod';

export const ${n.camel}ExecuteInput = z.object({
  id: z.string().min(1),
});

export const ${n.camel}ExecuteOutput = z.object({
  id: z.string(),
  processedAt: z.date(),
});

export type ${n.pascal}ExecuteInput = z.infer<typeof ${n.camel}ExecuteInput>;
export type ${n.pascal}ExecuteOutput = z.infer<typeof ${n.camel}ExecuteOutput>;

declare module '@mariachi/communication' {
  interface Procedures {
    '${n.camel}.execute': { input: ${n.pascal}ExecuteInput; output: ${n.pascal}ExecuteOutput };
  }
}
`;

const service = (n: Names) => `import type { Context } from '@mariachi/core';
import type { ${n.pascal}ExecuteInput, ${n.pascal}ExecuteOutput } from '../../contracts/${n.kebab}';

export class ${n.pascal}Service {
  async execute(ctx: Context, input: ${n.pascal}ExecuteInput): Promise<${n.pascal}ExecuteOutput> {
    ctx.logger.info({ id: input.id }, '${n.camel}.execute');
    return { id: input.id, processedAt: new Date() };
  }
}
`;

const serviceHandler = (n: Names) => `import type { CommunicationLayer } from '@mariachi/communication';
import { ${n.camel}ExecuteInput, ${n.camel}ExecuteOutput } from '../../contracts/${n.kebab}';
import type { ${n.pascal}Service } from './${n.kebab}.service';

export function register${n.pascal}Handlers(communication: CommunicationLayer, service: ${n.pascal}Service): void {
  communication.register('${n.camel}.execute', {
    schema: { input: ${n.camel}ExecuteInput, output: ${n.camel}ExecuteOutput },
    handler: (ctx, input) => service.execute(ctx, input),
  });
}
`;

const serviceTest = (n: Names) => `import { describe, expect, it } from 'vitest';
import { createContext, type Logger } from '@mariachi/core';
import { ${n.pascal}Service } from './${n.kebab}.service';

const logger = { debug() {}, info() {}, warn() {}, error() {}, child: () => logger } as unknown as Logger;

describe('${n.pascal}Service', () => {
  it('executes', async () => {
    const result = await new ${n.pascal}Service().execute(createContext({ logger, tenantId: 'tenant-1' }), { id: 'abc' });
    expect(result.id).toBe('abc');
  });
});
`;

/** `withContract` = a service contract exists for this name, so the controller reuses its schemas. */
export function controllerFile(n: Names, withContract: boolean): string {
  if (withContract) {
    return `import { BaseController } from '@mariachi/api-facade';
import { ${n.camel}ExecuteInput, ${n.camel}ExecuteOutput, type ${n.pascal}ExecuteOutput } from '../../contracts/${n.kebab}';

export class ${n.pascal}Controller extends BaseController {
  readonly prefix = '${n.kebab}';
  readonly tags = ['${n.kebab}'];

  init(): void {
    this.post('/', { schema: { body: ${n.camel}ExecuteInput, response: ${n.camel}ExecuteOutput } }, (ctx, body) =>
      this.call<${n.pascal}ExecuteOutput>(ctx, '${n.camel}.execute', body),
    );
  }
}
`;
  }
  return `import { BaseController } from '@mariachi/api-facade';
import { z } from 'zod';

const ${n.camel}Request = z.object({ id: z.string().min(1) });
const ${n.camel}Response = z.object({ id: z.string() });

/** Calls the \`${n.camel}.execute\` procedure; generate the service with \`mariachi generate service ${n.kebab}\`. */
export class ${n.pascal}Controller extends BaseController {
  readonly prefix = '${n.kebab}';
  readonly tags = ['${n.kebab}'];

  init(): void {
    this.post('/', { schema: { body: ${n.camel}Request, response: ${n.camel}Response } }, (ctx, body) =>
      this.call<z.infer<typeof ${n.camel}Response>>(ctx, '${n.camel}.execute', body),
    );
  }
}
`;
}

export function jobFile(n: Names): string {
  return `import { defineJob } from '@mariachi/jobs';
import { z } from 'zod';

/**
 * Enqueue with the caller's context (tenant and trace id carry over to the worker):
 *
 *   await jobs.enqueue(ctx, '${n.kebab}', { id });
 *   await jobs.enqueueWithDedup(ctx, '${n.kebab}', { id }, \`${n.kebab}:\${id}\`); // at most one pending per key
 */
export const ${n.camel}Job = defineJob({
  name: '${n.kebab}',
  schema: z.object({ id: z.string().min(1) }),
  retry: { attempts: 5, backoff: 'exponential', delay: 1_000 },
  timeoutMs: 60_000,
  handler: async (ctx, data) => {
    ctx.logger.info({ id: data.id, attempt: ctx.attemptNumber }, '${n.kebab} started');
  },
});
`;
}

export function integrationFiles(n: Names): Record<string, string> {
  const dir = `src/integrations/${n.kebab}`;
  return {
    [`${dir}/client.ts`]: integrationClient(n),
    [`${dir}/client.test.ts`]: integrationTest(n),
  };
}

const integrationClient = (n: Names) => `import { IntegrationError, retry, type Context } from '@mariachi/core';

export interface ${n.pascal}ClientOptions {
  baseUrl: string;
  /** Load from secrets/config in main.ts; never read process.env here. */
  apiKey: string;
  timeoutMs?: number;
  attempts?: number;
  retryDelayMs?: number;
  fetch?: typeof fetch;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Typed client with timeouts, retries on transient failures, and IntegrationError on failure. */
export class ${n.pascal}Client {
  private readonly fetch: typeof fetch;

  constructor(private readonly options: ${n.pascal}ClientOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  request<T>(ctx: Context, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
    return retry(
      async () => {
        const response = await this.fetch(new URL(path, this.options.baseUrl), {
          method,
          headers: {
            authorization: \`Bearer \${this.options.apiKey}\`,
            'content-type': 'application/json',
            'x-request-id': ctx.traceId,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
        });
        if (!response.ok) {
          const retryable = RETRYABLE_STATUS.has(response.status);
          throw new IntegrationError(
            retryable ? '${n.kebab}/unavailable' : '${n.kebab}/request-failed',
            \`${n.pascal} \${method} \${path} failed with \${response.status}\`,
            { status: response.status, retryable },
          );
        }
        return (await response.json()) as T;
      },
      {
        attempts: this.options.attempts ?? 3,
        baseDelayMs: this.options.retryDelayMs ?? 200,
        retryOn: (error) => !(error instanceof IntegrationError) || error.metadata?.retryable === true,
      },
    );
  }
}
`;

const integrationTest = (n: Names) => `import { describe, expect, it, vi } from 'vitest';
import { createContext, IntegrationError, type Logger } from '@mariachi/core';
import { ${n.pascal}Client } from './client';

const logger = { debug() {}, info() {}, warn() {}, error() {}, child: () => logger } as unknown as Logger;
const ctx = createContext({ logger });

function client(...statuses: number[]) {
  const fetch = vi.fn(async () => {
    const status = statuses.shift() ?? 200;
    return new Response(JSON.stringify({ ok: status < 400 }), { status });
  });
  return { fetch, client: new ${n.pascal}Client({ baseUrl: 'https://api.example.test', apiKey: 'k', retryDelayMs: 1, fetch }) };
}

describe('${n.pascal}Client', () => {
  it('retries transient failures', async () => {
    const { fetch, client: c } = client(503, 200);
    await expect(c.request(ctx, 'GET', '/ping')).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry client errors', async () => {
    const { fetch, client: c } = client(400);
    await expect(c.request(ctx, 'GET', '/ping')).rejects.toBeInstanceOf(IntegrationError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
`;
