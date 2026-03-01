import type { z } from 'zod';
import type { Context, Middleware } from '@mariachi/core';
import { CommunicationError } from '@mariachi/core';
import type { CommunicationLayer, ProcedureDefinition } from '../types';

export class InProcessAdapter implements CommunicationLayer {
  private readonly registry = new Map<string, ProcedureDefinition>();
  private readonly globalMiddlewares: Middleware[] = [];

  register<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny>(
    name: string,
    definition: ProcedureDefinition<TInput, TOutput>,
  ): void {
    this.registry.set(name, definition as unknown as ProcedureDefinition);
  }

  async call<TInput, TOutput>(name: string, ctx: Context, input: TInput): Promise<TOutput> {
    const procedure = this.registry.get(name);
    if (!procedure) {
      throw new CommunicationError('communication/not-found', `Procedure not found: ${name}`, {
        procedure: name,
      });
    }

    const validatedInput = procedure.schema.input.parse(input) as z.infer<typeof procedure.schema.input>;

    const ctxWithProcedure = { ...ctx, procedure: name };

    const allMiddlewares = [
      ...this.globalMiddlewares,
      ...(procedure.middleware ?? []),
    ];

    let result: z.infer<typeof procedure.schema.output>;
    let index = 0;

    const next = async (): Promise<void> => {
      if (index < allMiddlewares.length) {
        const mw = allMiddlewares[index++];
        await mw(ctxWithProcedure, next);
      } else {
        result = await procedure.handler(ctxWithProcedure, validatedInput);
      }
    };

    await next();

    return procedure.schema.output.parse(result) as TOutput;
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
