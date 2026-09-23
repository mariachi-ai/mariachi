import type { z } from 'zod';
import type { Context, Middleware } from '@mariachi/core';

export interface ProcedureContext extends Context {
  procedure?: string;
}

/**
 * Registry of procedure names to their input/output types. Augment it so `call()` is typed:
 *
 * ```ts
 * declare module '@mariachi/communication' {
 *   interface Procedures {
 *     'users.create': { input: CreateUserInput; output: User };
 *   }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: augmented by apps via declaration merging
export interface Procedures {}

export type ProcedureName = keyof Procedures & string;
export type ProcedureInput<N extends ProcedureName> = Procedures[N] extends { input: infer I } ? I : never;
export type ProcedureOutput<N extends ProcedureName> = Procedures[N] extends { output: infer O } ? O : never;

export interface ProcedureDefinition<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput extends z.ZodTypeAny = z.ZodTypeAny,
> {
  schema: { input: TInput; output: TOutput };
  handler: (ctx: ProcedureContext, input: z.infer<TInput>) => Promise<z.infer<TOutput>>;
  middleware?: Middleware[];
  /** Overrides the layer's default timeout for this procedure. */
  timeoutMs?: number;
  /** Scopes the caller must hold (checked before the handler runs). */
  requiredScopes?: string[];
}

export interface CallOptions {
  timeoutMs?: number;
}

export interface RegisterOptions {
  /** Replace an existing registration instead of throwing. */
  override?: boolean;
}

export interface CommunicationLayer {
  register<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny>(
    name: string,
    definition: ProcedureDefinition<TInput, TOutput>,
    options?: RegisterOptions,
  ): void;

  call<N extends ProcedureName>(ctx: Context, name: N, input: ProcedureInput<N>, options?: CallOptions): Promise<ProcedureOutput<N>>;
  call<TOutput = unknown>(ctx: Context, name: string, input: unknown, options?: CallOptions): Promise<TOutput>;

  use(middleware: Middleware): void;

  has(name: string): boolean;

  unregister(name: string): void;

  procedures(): string[];
}

export function defineProcedure<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny>(
  definition: ProcedureDefinition<TInput, TOutput>,
): ProcedureDefinition<TInput, TOutput> {
  return definition;
}
