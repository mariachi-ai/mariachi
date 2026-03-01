import type { z } from 'zod';
import type { Context, Middleware } from '@mariachi/core';

export interface ProcedureContext extends Context {
  procedure?: string;
}

export interface ProcedureDefinition<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput extends z.ZodTypeAny = z.ZodTypeAny,
> {
  schema: { input: TInput; output: TOutput };
  handler: (ctx: Context, input: z.infer<TInput>) => Promise<z.infer<TOutput>>;
  middleware?: Middleware[];
}

export interface CommunicationLayer {
  register<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny>(
    name: string,
    definition: ProcedureDefinition<TInput, TOutput>,
  ): void;

  call<TInput, TOutput>(name: string, ctx: Context, input: TInput): Promise<TOutput>;

  use(middleware: Middleware): void;

  has(name: string): boolean;

  procedures(): string[];
}
