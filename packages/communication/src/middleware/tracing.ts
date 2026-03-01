import type { Middleware } from '@mariachi/core';
import type { ProcedureContext } from '../types';

export function tracingMiddleware(): Middleware {
  return async (ctx: ProcedureContext, next: () => Promise<void>): Promise<void> => {
    ctx.logger.info({ procedure: ctx.procedure, traceId: ctx.traceId });
    await next();
    ctx.logger.info({ procedure: ctx.procedure, traceId: ctx.traceId });
  };
}
