import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Logger } from '@mariachi/core';
import { MariachiError, ConfigError, runWithContext, toErrorEnvelope, withSpan } from '@mariachi/core';
import { createLogger } from '@mariachi/observability';
import { contextFromRequest, traceIdFromTraceparent } from '../context';
import type {
  CorsOptions,
  IncomingRequest,
  InjectOptions,
  InjectResponse,
  RequestContext,
  SecurityHeadersOptions,
  ServerAdapter,
  ServerConfig,
  ServerMiddleware,
  ServerRoute,
} from '../types';
import { HttpResponse } from '../types';

declare module 'fastify' {
  interface FastifyRequest {
    serverCtx?: RequestContext;
    rawBody?: Buffer;
  }
}

const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/;
const DEFAULT_BODY_LIMIT = 1024 * 1024;

export function joinPath(...parts: Array<string | undefined>): string {
  const joined = parts
    .filter((p): p is string => !!p)
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
  return `/${joined}`;
}

function applyCors(req: FastifyRequest, reply: FastifyReply, cors: CorsOptions): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;
  const allowAny = cors.origins === '*';
  const allowed = allowAny || (cors.origins as string[]).includes(origin);
  if (!allowed) return false;
  reply.header('Access-Control-Allow-Origin', allowAny && !cors.credentials ? '*' : origin);
  reply.header('Vary', 'Origin');
  if (cors.credentials) reply.header('Access-Control-Allow-Credentials', 'true');
  if (cors.exposedHeaders?.length) reply.header('Access-Control-Expose-Headers', cors.exposedHeaders.join(', '));
  return true;
}

function applySecurityHeaders(reply: FastifyReply, opts: SecurityHeadersOptions) {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('Cross-Origin-Resource-Policy', 'same-origin');
  if (opts.hsts !== false) reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (opts.contentSecurityPolicy !== false) {
    reply.header('Content-Security-Policy', opts.contentSecurityPolicy ?? "default-src 'none'; frame-ancestors 'none'");
  }
}

function toQuery(query: unknown): Record<string, string | string[]> {
  return (query ?? {}) as Record<string, string | string[]>;
}

/**
 * HTTP transport: body parsing (with raw bytes preserved), request ids, CORS, security headers,
 * error envelopes and graceful close. Policy (auth, validation, rate limits) lives in api-facade.
 */
export class FastifyServerAdapter implements ServerAdapter {
  private readonly config: ServerConfig;
  private readonly middlewares: ServerMiddleware[] = [];
  private readonly routes: ServerRoute[] = [];
  private readonly configurers: Array<(fastify: FastifyInstance) => void | Promise<void>> = [];
  private instance: FastifyInstance | null = null;
  private building: Promise<FastifyInstance> | null = null;
  private readonly logger: Logger;

  constructor(config: ServerConfig) {
    this.config = config;
    this.logger = config.logger ?? createLogger();
  }

  withMiddleware(fn: ServerMiddleware): this {
    this.middlewares.push(fn);
    return this;
  }

  register(routes: ServerRoute[]): this {
    if (this.instance || this.building) {
      throw new ConfigError('server/already-started', 'Routes must be registered before the server starts');
    }
    this.routes.push(...routes);
    return this;
  }

  /** Escape hatch for Fastify plugins (static files, multipart). Runs before routes are added. */
  configure(fn: (fastify: FastifyInstance) => void | Promise<void>): this {
    this.configurers.push(fn);
    return this;
  }

  get fastify(): FastifyInstance | null {
    return this.instance;
  }

  async ready(): Promise<void> {
    await this.build();
  }

  private build(): Promise<FastifyInstance> {
    if (this.instance) return Promise.resolve(this.instance);
    if (!this.building) this.building = this.doBuild();
    return this.building;
  }

  private async doBuild(): Promise<FastifyInstance> {
    const cfg = this.config;
    const requestIdHeader = (cfg.requestIdHeader ?? 'x-request-id').toLowerCase();
    const fastify = Fastify({
      trustProxy: cfg.trustProxy ?? false,
      bodyLimit: cfg.bodyLimitBytes ?? DEFAULT_BODY_LIMIT,
      requestTimeout: cfg.requestTimeoutMs ?? 30_000,
      return503OnClosing: true,
      forceCloseConnections: 'idle',
      logger: false,
      disableRequestLogging: true,
      genReqId: (req) => {
        const incoming = req.headers[requestIdHeader] ?? req.headers['x-trace-id'];
        const value = Array.isArray(incoming) ? incoming[0] : incoming;
        return value && REQUEST_ID_RE.test(value) ? value : randomUUID();
      },
    });
    fastify.decorateRequest('rawBody', undefined);

    fastify.removeAllContentTypeParsers();
    fastify.addContentTypeParser(['application/json', 'application/*+json'], { parseAs: 'buffer' }, (req, body, done) => {
      const buf = body as Buffer;
      req.rawBody = buf;
      if (buf.length === 0) return done(null, undefined);
      try {
        done(null, JSON.parse(buf.toString('utf8')));
      } catch {
        done(new MariachiError('http/invalid-json', 'Request body is not valid JSON'), undefined);
      }
    });
    fastify.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'buffer' }, (req, body, done) => {
      const buf = body as Buffer;
      req.rawBody = buf;
      const params = new URLSearchParams(buf.toString('utf8'));
      const out: Record<string, string | string[]> = {};
      for (const key of new Set(params.keys())) {
        const all = params.getAll(key);
        out[key] = all.length > 1 ? all : (all[0] ?? '');
      }
      done(null, out);
    });
    fastify.addContentTypeParser('text/plain', { parseAs: 'buffer' }, (req, body, done) => {
      req.rawBody = body as Buffer;
      done(null, (body as Buffer).toString('utf8'));
    });
    fastify.addContentTypeParser('*', { parseAs: 'buffer' }, (req, body, done) => {
      req.rawBody = body as Buffer;
      done(null, body);
    });

    const cors = cfg.cors || undefined;
    if (cors && cors.origins === '*' && cors.credentials) {
      throw new ConfigError('server/cors-config', "CORS origins '*' cannot be combined with credentials");
    }
    const security = cfg.securityHeaders === false ? undefined : cfg.securityHeaders === true || !cfg.securityHeaders ? {} : cfg.securityHeaders;

    fastify.addHook('onRequest', async (req, reply) => {
      const tp = req.headers.traceparent;
      const traceId = traceIdFromTraceparent(Array.isArray(tp) ? tp[0] : tp) ?? req.id;
      const logger = this.logger.child({ requestId: req.id, traceId, server: cfg.name });
      req.serverCtx = {
        traceId,
        requestId: req.id,
        logger,
        server: cfg.name,
        ip: req.ip,
        startedAt: Date.now(),
        responseHeaders: {},
      };
      reply.header(requestIdHeader, req.id);
      if (security) applySecurityHeaders(reply, security);
      if (cors) {
        const allowed = applyCors(req, reply, cors);
        if (req.method === 'OPTIONS' && req.headers['access-control-request-method']) {
          if (!allowed) return reply.status(403).send();
          reply.header('Access-Control-Allow-Methods', (cors.methods ?? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).join(', '));
          reply.header(
            'Access-Control-Allow-Headers',
            (cors.allowedHeaders ?? ['authorization', 'content-type', 'x-api-key', requestIdHeader, 'x-tenant-id']).join(', '),
          );
          reply.header('Access-Control-Max-Age', String(cors.maxAgeSeconds ?? 600));
          return reply.status(204).send();
        }
      }
    });

    fastify.addHook('onSend', async (req, reply, payload) => {
      const headers = req.serverCtx?.responseHeaders;
      if (headers) for (const [k, v] of Object.entries(headers)) reply.header(k, v);
      return payload;
    });

    fastify.addHook('onResponse', async (req, reply) => {
      const ctx = req.serverCtx;
      if (!ctx) return;
      const entry = {
        method: req.method,
        route: req.routeOptions.url ?? req.url,
        status: reply.statusCode,
        durationMs: Date.now() - ctx.startedAt,
      };
      if (reply.statusCode >= 500) ctx.logger.error(entry, 'request failed');
      else ctx.logger.info(entry, 'request completed');
    });

    fastify.setErrorHandler((err: Error & { statusCode?: number; code?: string }, req, reply) => {
      const traceId = req.serverCtx?.traceId ?? req.id;
      let input: unknown = err;
      if (!(err instanceof MariachiError)) {
        if (err.code === 'FST_ERR_CTP_BODY_TOO_LARGE') input = new MariachiError('http/payload-too-large', 'Request body too large');
        else if (err.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') input = new MariachiError('http/unsupported-media-type', 'Unsupported content type');
        else if (err.code === 'FST_ERR_CTP_EMPTY_JSON_BODY') input = new MariachiError('http/invalid-json', 'Empty JSON body');
      }
      const { status: httpStatus, body } = toErrorEnvelope(input, traceId);
      if (httpStatus >= 500) (req.serverCtx?.logger ?? this.logger).error({ err }, 'Unhandled error');
      const retryAfter = (input as MariachiError).metadata?.retryAfterSeconds;
      if (typeof retryAfter === 'number') reply.header('Retry-After', String(Math.ceil(retryAfter)));
      return reply.status(httpStatus).send(body);
    });

    fastify.setNotFoundHandler((req, reply) => {
      reply.status(404).send({ error: { code: 'http/not-found', message: `Route ${req.method} ${req.url} not found`, traceId: req.id } });
    });

    for (const configure of this.configurers) await configure(fastify);

    for (const route of this.routes) {
      const url = joinPath(cfg.prefix, route.path);
      fastify.route({
        method: route.method,
        url,
        bodyLimit: route.bodyLimitBytes,
        schema: route.schema,
        handler: async (req, reply) => {
          const ctx = req.serverCtx!;
          const incoming: IncomingRequest = {
            headers: req.headers as Record<string, string | string[] | undefined>,
            body: req.body,
            rawBody: req.rawBody,
            params: (req.params as Record<string, string>) ?? {},
            query: toQuery(req.query),
            method: req.method,
            url: req.url,
            routePath: url,
            ip: req.ip,
          };

          const base = contextFromRequest(ctx);
          const attributes = { 'http.method': req.method, 'http.route': url, traceId: ctx.traceId };
          return runWithContext(base, () => withSpan(cfg.tracer, 'http.request', attributes, async () => {
            let result: unknown;
            const run = async (index: number): Promise<void> => {
              if (index < this.middlewares.length) {
                await this.middlewares[index](ctx, () => run(index + 1), incoming);
                return;
              }
              result = await route.handler(ctx, incoming);
            };
            await run(0);
            if (result instanceof HttpResponse) {
              for (const [k, v] of Object.entries(result.headers)) reply.header(k, v);
              reply.status(result.status);
              return result.status === 204 ? reply.send() : reply.send(result.body);
            }
            if (result === undefined) return reply.status(204).send();
            return result;
          }));
        },
      });
    }

    await fastify.ready();
    this.instance = fastify;
    return fastify;
  }

  async listen(port: number, host?: string): Promise<string> {
    const fastify = await this.build();
    const address = await fastify.listen({ port, host: host ?? this.config.host ?? '0.0.0.0' });
    this.logger.info({ server: this.config.name, address }, 'server listening');
    return address;
  }

  async inject(options: InjectOptions): Promise<InjectResponse> {
    const fastify = await this.build();
    const res = await fastify.inject({
      method: options.method,
      url: options.url,
      headers: options.headers,
      payload: options.payload as string | object | Buffer | undefined,
    });
    return {
      statusCode: res.statusCode,
      headers: res.headers,
      body: res.body,
      json: <T>() => JSON.parse(res.body) as T,
    };
  }

  async close(): Promise<void> {
    const fastify = this.instance;
    if (!fastify) return;
    const timeout = this.config.shutdownTimeoutMs ?? 10_000;
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      fastify.close(),
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          this.logger.warn({ server: this.config.name }, 'server close timed out; forcing connections closed');
          fastify.server.closeAllConnections?.();
          resolve();
        }, timeout);
      }),
    ]);
    if (timer) clearTimeout(timer);
    this.instance = null;
    this.building = null;
  }
}
