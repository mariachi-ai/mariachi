import {
  AuthError,
  ConfigError,
  MariachiError,
  TenancyError,
  fromZodError,
  runWithContext,
  type Logger,
} from '@mariachi/core';
import { createLogger } from '@mariachi/observability';
import { FastifyServerAdapter, HttpResponse, contextFromRequest, httpResponse } from '@mariachi/server';
import type { IncomingRequest, InjectOptions, InjectResponse, RequestContext } from '@mariachi/server';
import type { RateLimitRule } from '@mariachi/rate-limit';
import type { z } from 'zod';
import type { BaseController } from './controller';
import { generateOpenApi } from './openapi';
import type {
  ApiServerConfig,
  AuthStrategy,
  AuthStrategyHandler,
  HealthSource,
  HttpContext,
  HttpMiddleware,
  OpenApiSettings,
  RateLimitSettings,
  ResolvedIdentity,
  RouteDefinition,
} from './types';

function parse<T>(schema: z.ZodTypeAny | undefined, value: unknown, where: string): T {
  if (!schema) return value as T;
  const result = schema.safeParse(value);
  if (!result.success) {
    const err = fromZodError(result.error);
    throw Object.assign(err, { message: `Invalid ${where}` });
  }
  return result.data as T;
}

function header(req: IncomingRequest, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * The API facade: authentication, tenancy, validation, rate limiting and OpenAPI on top of the
 * `@mariachi/server` transport (which owns parsing, request ids, tracing, CORS and error
 * envelopes). Controllers never talk to services directly; they `call()` procedures.
 */
export class FastifyAdapter {
  private readonly config: ApiServerConfig;
  private readonly server: FastifyServerAdapter;
  private readonly strategies = new Map<string, AuthStrategyHandler>();
  private defaultAuth: AuthStrategy[] = [];
  private rateLimit?: RateLimitSettings;
  private readonly middlewares: HttpMiddleware[] = [];
  private readonly routes: RouteDefinition[] = [];
  private openApi?: OpenApiSettings;
  private health?: { source: HealthSource; path: string };
  private readonly logger: Logger;
  private built = false;

  constructor(config: ApiServerConfig) {
    this.config = config;
    this.logger = config.logger ?? createLogger();
    this.server = new FastifyServerAdapter({ ...config, logger: this.logger });
  }

  /** Registers a named auth strategy (e.g. `session` → `bearerStrategy(jwt)`). */
  withAuthStrategy(name: AuthStrategy, handler: AuthStrategyHandler): this {
    this.strategies.set(name, handler);
    return this;
  }

  /** Default strategies for routes that don't set `auth`. Routes with `auth: false` are public. */
  withAuth(strategy: AuthStrategy | AuthStrategy[]): this {
    this.defaultAuth = Array.isArray(strategy) ? strategy : [strategy];
    return this;
  }

  withRateLimit(settings: RateLimitSettings): this {
    this.rateLimit = settings;
    return this;
  }

  withMiddleware(fn: HttpMiddleware): this {
    this.middlewares.push(fn);
    return this;
  }

  withOpenApi(settings: OpenApiSettings): this {
    this.openApi = settings;
    return this;
  }

  /** Mounts `GET {path}/live`, `{path}/ready` (503 when unhealthy) and `{path}/startup`. */
  withHealth(source: HealthSource, options: { path?: string } = {}): this {
    this.health = { source, path: options.path ?? '/health' };
    return this;
  }

  register(routes: RouteDefinition[]): this {
    this.routes.push(...(routes as RouteDefinition[]));
    return this;
  }

  registerController(controller: BaseController): this {
    return this.register(controller.routes());
  }

  /** Every registered route, for docs and tests. */
  listRoutes(): ReadonlyArray<RouteDefinition> {
    return this.routes;
  }

  openApiDocument(): Record<string, unknown> {
    if (!this.openApi) throw new ConfigError('api/openapi-disabled', 'Call withOpenApi() first');
    return generateOpenApi(this.routes, this.openApi, { prefix: this.config.prefix, defaultAuth: this.defaultAuth });
  }

  private routeStrategies(route: RouteDefinition): AuthStrategy[] {
    if (route.auth === false) return [];
    if (route.auth) return Array.isArray(route.auth) ? route.auth : [route.auth];
    return this.defaultAuth;
  }

  private async resolveIdentity(req: IncomingRequest, strategies: AuthStrategy[]): Promise<ResolvedIdentity | null> {
    for (const name of strategies) {
      const identity = await this.strategies.get(name)!(req);
      if (identity) return identity;
    }
    return null;
  }

  private rateLimitKey(ctx: HttpContext): string {
    if (this.rateLimit?.key) return this.rateLimit.key(ctx);
    if (ctx.apiKeyId) return `key:${ctx.apiKeyId}`;
    if (ctx.userId) return `user:${ctx.tenantId ?? '-'}:${ctx.userId}`;
    return `ip:${ctx.request.ip}`;
  }

  private async enforceRateLimit(ctx: HttpContext, route: RouteDefinition): Promise<void> {
    const settings = this.rateLimit;
    if (!settings || route.rateLimit === false) return;
    let rule: RateLimitRule | undefined = route.rateLimit;
    if (!rule && ctx.tenantId && settings.forTenant) rule = settings.forTenant(ctx.tenantId);
    if (!rule) rule = ctx.identity ? settings.default : (settings.anonymous ?? settings.default);
    const scope = route.rateLimit ? `${route.method}:${route.path}` : 'global';
    const key = `${scope}:${this.rateLimitKey(ctx)}`;
    let result: Awaited<ReturnType<typeof settings.limiter.check>>;
    try {
      result = await settings.limiter.check(key, rule);
    } catch (error) {
      if (settings.failOpen === false) throw error;
      ctx.logger.warn({ err: error }, 'rate limiter unavailable; allowing request');
      return;
    }
    if (settings.headers !== false) {
      ctx.responseHeaders['RateLimit-Limit'] = String(result.limit);
      ctx.responseHeaders['RateLimit-Remaining'] = String(result.remaining);
      ctx.responseHeaders['RateLimit-Reset'] = String(Math.max(0, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)));
    }
    if (!result.allowed) {
      throw new MariachiError('rate-limit/exceeded', 'Rate limit exceeded', {
        retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
      });
    }
  }

  private buildHandler(route: RouteDefinition) {
    const strategies = this.routeStrategies(route);
    const tenantHeader = this.config.tenantHeader ?? 'x-tenant-id';
    const validateResponses = this.config.validateResponses ?? true;

    return async (serverCtx: RequestContext, req: IncomingRequest): Promise<unknown> => {
      let identity: ResolvedIdentity | null = null;
      if (strategies.length > 0) {
        identity = await this.resolveIdentity(req, strategies);
        if (!identity) throw new AuthError('auth/unauthorized', 'Authentication required');
        if (!identity.tenantId) throw new TenancyError('tenancy/missing-tenant', 'Identity has no tenant');
        const requested = header(req, tenantHeader);
        if (requested && requested !== identity.tenantId && identity.identityType !== 'service') {
          throw new TenancyError('tenancy/mismatch', 'Tenant header does not match authenticated tenant');
        }
        if (route.scopes?.length) {
          const missing = route.scopes.filter((s) => !identity!.scopes.includes(s));
          if (missing.length) throw new AuthError('auth/forbidden', 'Insufficient scope', { missing });
        }
      }

      const base = contextFromRequest(serverCtx, identity ?? undefined);
      const ctx: HttpContext = {
        ...base,
        identity,
        locals: {},
        request: { ip: req.ip, method: req.method, url: req.url, routePath: req.routePath, headers: req.headers, rawBody: req.rawBody },
        responseHeaders: serverCtx.responseHeaders,
      };

      return runWithContext(ctx, async () => {
        await this.enforceRateLimit(ctx, route);

        let result: unknown;
        const run = async (index: number): Promise<void> => {
          if (index < this.middlewares.length) {
            await this.middlewares[index](ctx, () => run(index + 1));
            return;
          }
          const body = parse(route.schema?.body, req.body, 'request body');
          const params = parse<Record<string, string>>(route.schema?.params, req.params, 'path parameters');
          const query = parse<Record<string, string | string[]>>(route.schema?.query, req.query, 'query parameters');
          result = await route.handler(ctx, body, params, query);
        };
        await run(0);

        if (result instanceof HttpResponse || result === undefined) return result;
        if (route.schema?.response && validateResponses) {
          const checked = route.schema.response.safeParse(result);
          if (!checked.success) {
            ctx.logger.error({ issues: checked.error.issues, route: route.path }, 'response failed schema validation');
            throw new MariachiError('api/invalid-response', 'Response failed validation');
          }
          result = checked.data;
        }
        return route.status && route.status !== 200 ? httpResponse(route.status, result) : result;
      });
    };
  }

  private build(): void {
    if (this.built) return;
    this.built = true;

    for (const route of this.routes) {
      for (const name of this.routeStrategies(route)) {
        if (!this.strategies.has(name)) {
          throw new ConfigError(
            'api/unknown-auth-strategy',
            `Route ${route.method} ${route.path} uses auth strategy "${name}" which is not registered (withAuthStrategy)`,
          );
        }
      }
    }

    const internal: RouteDefinition[] = [];
    if (this.openApi) {
      const doc = () => this.openApiDocument();
      internal.push({ method: 'GET', path: this.openApi.path ?? '/openapi.json', auth: false, rateLimit: false, handler: async () => doc() });
    }
    if (this.health) {
      const { source, path } = this.health;
      internal.push(
        { method: 'GET', path: `${path}/live`, auth: false, rateLimit: false, handler: async () => source.liveness() },
        {
          method: 'GET',
          path: `${path}/ready`,
          auth: false,
          rateLimit: false,
          handler: async () => {
            const report = await source.readiness();
            return httpResponse(report.status === 'unhealthy' ? 503 : 200, report);
          },
        },
        {
          method: 'GET',
          path: `${path}/startup`,
          auth: false,
          rateLimit: false,
          handler: async () => {
            const report = source.startup ? await source.startup() : { status: 'healthy' as const };
            return httpResponse(report.status === 'unhealthy' ? 503 : 200, report);
          },
        },
      );
    }

    this.server.register(
      [...internal, ...this.routes].map((route) => ({
        method: route.method,
        path: route.path,
        bodyLimitBytes: route.bodyLimitBytes,
        handler: this.buildHandler(route),
      })),
    );
  }

  async ready(): Promise<void> {
    this.build();
    await this.server.ready();
  }

  async listen(port: number, host?: string): Promise<string> {
    this.build();
    return this.server.listen(port, host);
  }

  async inject(options: InjectOptions): Promise<InjectResponse> {
    this.build();
    return this.server.inject(options);
  }

  async close(): Promise<void> {
    await this.server.close();
  }
}

/** Preferred factory for API servers. */
export function createApiServer(config: ApiServerConfig): FastifyAdapter {
  return new FastifyAdapter(config);
}
