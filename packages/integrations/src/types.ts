import type { z } from 'zod';

export interface IntegrationFnDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  input: z.ZodType<TInput>;
  output: z.ZodType<TOutput>;
  handler: (input: TInput, ctx: IntegrationContext) => Promise<TOutput>;
  retry?: { attempts: number; backoff: 'exponential' | 'linear' };
}

export interface IntegrationContext {
  tenantId?: string;
  traceId?: string;
  logger?: { info: Function; error: Function };
}

export interface WebhookHandlerDefinition<T = unknown> {
  verify: (req: WebhookRequest) => boolean;
  parse: (body: unknown) => T;
  handle: (payload: T, ctx: IntegrationContext) => Promise<void>;
}

export interface WebhookRequest {
  body: unknown;
  headers: Record<string, string | undefined>;
  rawBody?: string | Buffer;
}

export interface IntegrationRegistryEntry {
  name: string;
  description: string;
  credentialSchema: z.ZodType;
  functions: string[];
}
