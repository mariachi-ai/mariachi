import type { Middleware } from '@mariachi/core';
import type { ProcedureContext } from '../types';

export function loggerMiddleware(): Middleware {
  return async (ctx: ProcedureContext, next: () => Promise<void>): Promise<void> => {
    const start = performance.now();
    ctx.logger.info({ procedure: ctx.procedure }, 'request start');
    await next();
    const duration = performance.now() - start;
    ctx.logger.info({ procedure: ctx.procedure, durationMs: duration }, 'request end');
  };
}
