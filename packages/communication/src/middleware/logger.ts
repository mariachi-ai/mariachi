import type { Middleware } from '@mariachi/core';
import type { ProcedureContext } from '../types';

export function loggerMiddleware(): Middleware {
  return async (ctx: ProcedureContext, next: () => Promise<void>): Promise<void> => {
    const start = performance.now();
    ctx.logger.debug({ procedure: ctx.procedure, traceId: ctx.traceId }, 'procedure start');
    try {
      await next();
      ctx.logger.info({ procedure: ctx.procedure, traceId: ctx.traceId, durationMs: Math.round(performance.now() - start) }, 'procedure ok');
    } catch (err) {
      ctx.logger.warn(
        { procedure: ctx.procedure, traceId: ctx.traceId, durationMs: Math.round(performance.now() - start), err },
        'procedure failed',
      );
      throw err;
    }
  };
}
