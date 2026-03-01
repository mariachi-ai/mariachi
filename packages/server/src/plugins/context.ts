import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from '@mariachi/core';
import type { RequestContext } from '../types';

declare module 'fastify' {
  interface FastifyRequest {
    serverCtx?: RequestContext;
  }
}

export interface ContextPluginOptions {
  logger: Logger;
  serverName: string;
  getTraceId?: (req: FastifyRequest) => string;
}

export async function contextPlugin(
  fastify: FastifyInstance,
  opts: ContextPluginOptions,
): Promise<void> {
  const getTraceId = opts.getTraceId ?? ((req: FastifyRequest) => (req.headers['x-trace-id'] as string) ?? crypto.randomUUID());
  fastify.addHook('preHandler', async (req: FastifyRequest, _reply: FastifyReply) => {
    const traceId = getTraceId(req);
    const logger = opts.logger.child({ traceId });
    req.serverCtx = {
      traceId,
      logger,
      server: opts.serverName,
    };
  });
}
