import type { z } from 'zod';
import type { Context, Middleware } from '@mariachi/core';
import { AuthError, CommunicationError, fromZodError, runWithContext, withTimeout } from '@mariachi/core';
import type { CallOptions, CommunicationLayer, ProcedureContext, ProcedureDefinition, RegisterOptions } from '../types';

export interface InProcessAdapterOptions {
  /** Default per-call timeout. Default 30s. `0` disables. */
  defaultTimeoutMs?: number;
}

export class InProcessAdapter implements CommunicationLayer {
  private readonly registry = new Map<string, ProcedureDefinition>();
  private readonly globalMiddlewares: Middleware[] = [];
  private readonly defaultTimeoutMs: number;

  constructor(options: InProcessAdapterOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000;
  }

  register<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny>(
    name: string,
    definition: ProcedureDefinition<TInput, TOutput>,
    options: RegisterOptions = {},
  ): void {
    if (this.registry.has(name) && !options.override) {
      throw new CommunicationError(
        'communication/duplicate-procedure',
        `Procedure "${name}" is already registered. Pass { override: true } to replace it.`,
        { procedure: name },
      );
    }
    this.registry.set(name, definition as unknown as ProcedureDefinition);
  }

  unregister(name: string): void {
    this.registry.delete(name);
  }

  async call<TOutput = unknown>(ctx: Context, name: string, input: unknown, options: CallOptions = {}): Promise<TOutput> {
    const procedure = this.registry.get(name);
    if (!procedure) {
      throw new CommunicationError('communication/not-found', `Procedure not found: ${name}`, { procedure: name });
    }

    const parsedInput = procedure.schema.input.safeParse(input);
    if (!parsedInput.success) throw fromZodError(parsedInput.error, `Invalid input for ${name}`);

    const ctxWithProcedure: ProcedureContext = { ...ctx, procedure: name };

    if (procedure.requiredScopes?.length) {
      const missing = procedure.requiredScopes.filter((s) => !ctx.scopes.includes(s));
      if (missing.length) {
        throw new AuthError('auth/forbidden', `Missing required scopes for ${name}: ${missing.join(', ')}`, { missing });
      }
    }

    const middlewares = [...this.globalMiddlewares, ...(procedure.middleware ?? [])];
    let reachedHandler = false;
    let result: unknown;

    const dispatch = async (index: number): Promise<void> => {
      if (index < middlewares.length) {
        let called = false;
        await middlewares[index](ctxWithProcedure, async () => {
          if (called) throw new CommunicationError('communication/next-called-twice', 'next() called more than once');
          called = true;
          await dispatch(index + 1);
        });
        return;
      }
      reachedHandler = true;
      result = await procedure.handler(ctxWithProcedure, parsedInput.data);
    };

    const timeoutMs = options.timeoutMs ?? procedure.timeoutMs ?? this.defaultTimeoutMs;
    const run = runWithContext(ctxWithProcedure, () => dispatch(0));
    await (timeoutMs > 0 ? withTimeout(run, timeoutMs, 'communication/timeout', `Procedure ${name} timed out after ${timeoutMs}ms`) : run);

    if (!reachedHandler) {
      throw new CommunicationError(
        'communication/short-circuited',
        `A middleware for ${name} returned without calling next() or throwing`,
        { procedure: name },
      );
    }

    const parsedOutput = procedure.schema.output.safeParse(result);
    if (!parsedOutput.success) {
      throw new CommunicationError('communication/invalid-output', `Handler for ${name} returned invalid output`, {
        procedure: name,
        issues: parsedOutput.error.issues,
      });
    }
    return parsedOutput.data as TOutput;
  }

  use(middleware: Middleware): void {
    this.globalMiddlewares.push(middleware);
  }

  has(name: string): boolean {
    return this.registry.has(name);
  }

  procedures(): string[] {
    return Array.from(this.registry.keys());
  }
}
