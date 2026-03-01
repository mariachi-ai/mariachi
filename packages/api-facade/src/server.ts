import type { Logger } from '@mariachi/core';
import { createContext } from '@mariachi/core';
import { createLogger } from '@mariachi/observability';
import { FastifyServerAdapter } from '@mariachi/server';
import type { ServerConfig } from '@mariachi/server';
import type { RateLimitConfig, RouteDefinition, AuthStrategy, HttpContext, HttpMiddleware, RequestIdentity } from './types';
import type { BaseController } from './controller';
import { resolveAuth } from './auth/resolver';

export class FastifyAdapter {
  private readonly config: ServerConfig;
  private readonly server: FastifyServerAdapter;
  private authStrategies: AuthStrategy[] = [];
  private rateLimitConfig?: RateLimitConfig;
  private middlewares: HttpMiddleware[] = [];
  private routes: RouteDefinition[] = [];
  private logger: Logger;

  constructor(config: ServerConfig) {
    this.config = config;
    this.server = new FastifyServerAdapter(config);
    this.logger = createLogger();
  }

  withAuth(strategy: AuthStrategy | AuthStrategy[]): this {
    this.authStrategies = Array.isArray(strategy) ? strategy : [strategy];
    return this;
  }

  withRateLimit(config: RateLimitConfig): this {
    this.rateLimitConfig = config;
    return this;
  }

  withMiddleware(fn: HttpMiddleware): this {
    this.middlewares.push(fn);
    return this;
  }

  register(routes: RouteDefinition[]): this {
    this.routes.push(...routes);
    return this;
  }

  registerController(controller: BaseController): this {
    return this.register(controller.routes());
  }

  async listen(port: number): Promise<void> {
    for (const route of this.routes) {
      const routeAuth = route.auth === false
        ? []
        : Array.isArray(route.auth)
          ? route.auth
          : route.auth
            ? [route.auth]
            : this.authStrategies;

      this.server.register([{
        method: route.method,
        path: route.path,
        handler: async (serverCtx, req) => {
          let identity: RequestIdentity | null = null;

          if (routeAuth.length > 0) {
            const resolved = resolveAuth(req, routeAuth);
            if (!resolved) {
              throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
            }
            identity = {
              userId: resolved.userId,
              tenantId: resolved.tenantId,
              scopes: resolved.scopes,
              identityType: resolved.identityType,
              apiKeyId: resolved.apiKeyId,
              sessionId: resolved.sessionId,
            };
          }

          const ctx = createContext({
            traceId: serverCtx.traceId,
            logger: serverCtx.logger,
            userId: identity?.userId ?? null,
            tenantId: identity?.tenantId ?? null,
            scopes: identity?.scopes ?? [],
            identityType: identity?.identityType ?? 'anonymous',
            apiKeyId: identity?.apiKeyId,
            sessionId: identity?.sessionId,
            server: this.config.name,
          });

          const httpCtx: HttpContext = { ...ctx, identity, locals: {} };

          const runMiddlewares = async (c: HttpContext, index: number): Promise<void> => {
            if (index >= this.middlewares.length) return;
            await this.middlewares[index](c, () => runMiddlewares(c, index + 1));
          };
          await runMiddlewares(httpCtx, 0);

          return route.handler(httpCtx, req.body, req.params, req.query);
        },
      }]);
    }

    await this.server.listen(port);
  }

  async close(): Promise<void> {
    await this.server.close();
  }
}
