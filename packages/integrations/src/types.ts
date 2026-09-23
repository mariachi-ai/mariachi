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
  logger?: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
  secrets?: { get(key: string, tenantId?: string): Promise<string | undefined> };
  decrypt?: { decrypt(ciphertext: string): Promise<string> };
  credentialKey?: string;
}

export type IntegrationHandler = (input: unknown, ctx: IntegrationContext) => Promise<unknown>;

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
  /** Invoked by `registry.call`. Keys are the function names, without the integration prefix. */
  handlers?: Record<string, IntegrationHandler>;
}
