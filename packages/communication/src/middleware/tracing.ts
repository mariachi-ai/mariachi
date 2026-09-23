import type { Middleware, TracerAdapter } from '@mariachi/core';
import { withSpan } from '@mariachi/core';
import type { ProcedureContext } from '../types';

/**
 * Opens a span around the handler (inside other middleware). `Communication.call()` already
 * spans the whole call; use this when you use a bare `InProcessAdapter`.
 */
export function tracingMiddleware(tracer: TracerAdapter): Middleware {
  return async (ctx: ProcedureContext, next: () => Promise<void>): Promise<void> => {
    await withSpan(tracer, `procedure ${ctx.procedure}`, { 'mariachi.procedure': ctx.procedure ?? 'unknown', 'mariachi.trace_id': ctx.traceId }, () => next());
  };
}
