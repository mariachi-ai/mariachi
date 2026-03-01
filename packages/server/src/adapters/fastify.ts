import Fastify from 'fastify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from '@mariachi/core';
import { MariachiError, errorToHttpStatus } from '@mariachi/core';
import { createLogger } from '@mariachi/observability';
import type { ServerAdapter, ServerConfig, ServerRoute, ServerMiddleware, RequestContext, IncomingRequest } from '../types';
import { contextPlugin } from '../plugins/context';
import { tracingPlugin } from '../plugins/tracing';

export class FastifyServerAdapter implements ServerAdapter {
  private readonly config: ServerConfig;
  private readonly middlewares: ServerMiddleware[] = [];
  private readonly routes: ServerRoute[] = [];
  private instance: FastifyInstance | null = null;
  private readonly logger: Logger;

  constructor(config: ServerConfig) {
    this.config = config;
    this.logger = createLogger();
  }

  withMiddleware(fn: ServerMiddleware): this {
    this.middlewares.push(fn);
    return this;
  }

  register(routes: ServerRoute[]): this {
    this.routes.push(...routes);
    return this;
  }

  async listen(port: number): Promise<void> {
    const fastify = Fastify({
      trustProxy: this.config.trustProxy,
    });

    await fastify.register(contextPlugin, {
      logger: this.logger,
      serverName: this.config.name,
      getTraceId: (req) => (req.headers['x-trace-id'] as string) ?? crypto.randomUUID(),
    });

    await fastify.register(tracingPlugin);

    const prefix = this.config.prefix ?? '';

    for (const route of this.routes) {
      fastify.route({
        method: route.method,
        url: prefix + route.path,
        handler: async (req: FastifyRequest, _reply: FastifyReply) => {
          const ctx = req.serverCtx!;

          const runMiddlewares = async (c: RequestContext, index: number): Promise<void> => {
            if (index >= this.middlewares.length) return;
            await this.middlewares[index](c, () => runMiddlewares(c, index + 1));
          };
          await runMiddlewares(ctx, 0);

          const incoming: IncomingRequest = {
            headers: req.headers as Record<string, string | string[] | undefined>,
            body: (req as FastifyRequest<{ Body?: unknown }>).body,
            params: (req.params as Record<string, string>) ?? {},
            query: (req.query as Record<string, string>) ?? {},
            method: req.method,
            url: req.url,
          };

          return route.handler(ctx, incoming);
        },
      });
    }

    fastify.setErrorHandler((err: Error & { statusCode?: number }, req: FastifyRequest, reply: FastifyReply) => {
      if (err instanceof MariachiError) {
        const status = errorToHttpStatus(err);
        return reply.status(status).send({ error: err.message, code: err.code });
      }
      if (err.statusCode && err.statusCode >= 400 && err.statusCode < 600) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      req.serverCtx?.logger.error({ err }, 'Unhandled error');
      return reply.status(500).send({ error: 'Internal Server Error' });
    });

    this.instance = fastify;
    await fastify.listen({ port });
  }

  async close(): Promise<void> {
    if (this.instance) {
      await this.instance.close();
      this.instance = null;
    }
  }
}
