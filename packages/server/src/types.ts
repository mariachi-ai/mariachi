import type { Logger, TracerAdapter } from '@mariachi/core';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface CorsOptions {
  /** Allowed origins. `'*'` allows any origin (never combined with credentials). */
  origins: string[] | '*';
  credentials?: boolean;
  methods?: HttpMethod[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  maxAgeSeconds?: number;
}

export interface SecurityHeadersOptions {
  /** Send Strict-Transport-Security. Default true. */
  hsts?: boolean;
  /** Content-Security-Policy value. Default `default-src 'none'; frame-ancestors 'none'` (API-safe). */
  contentSecurityPolicy?: string | false;
}

export interface ServerConfig {
  name: string;
  /** Prefix for every route (e.g. `/api/v1`). */
  prefix?: string;
  /** Bind address. Default `0.0.0.0`. */
  host?: string;
  trustProxy?: boolean | string | string[] | number;
  /** Max request body. Default 1 MiB. */
  bodyLimitBytes?: number;
  /** CORS policy. Default: disabled (no CORS headers; browsers block cross-origin calls). */
  cors?: CorsOptions | false;
  /** Default true. */
  securityHeaders?: boolean | SecurityHeadersOptions;
  /** Incoming/outgoing request id header. Default `x-request-id`. */
  requestIdHeader?: string;
  /** Per-request timeout. Default 30s. */
  requestTimeoutMs?: number;
  /** Time allowed for in-flight requests on close. Default 10s. */
  shutdownTimeoutMs?: number;
  logger?: Logger;
  /** Wraps every request in an `http.request` span. */
  tracer?: TracerAdapter;
}

export interface RequestContext {
  /** From W3C `traceparent` when present, otherwise the request id. */
  traceId: string;
  requestId: string;
  logger: Logger;
  server: string;
  ip: string;
  startedAt: number;
  /** Headers applied to the response, including error responses (e.g. RateLimit-*). */
  responseHeaders: Record<string, string>;
}

export interface IncomingRequest {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  /** Exact request bytes, for signature verification (HMAC, Svix, Stripe). */
  rawBody?: Buffer;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  method: string;
  url: string;
  /** Route pattern, e.g. `/users/:id`. */
  routePath: string;
  ip: string;
}

/** Return from a handler to control status code and headers. */
export class HttpResponse<T = unknown> {
  constructor(
    readonly status: number,
    readonly body: T,
    readonly headers: Record<string, string> = {},
  ) {}
}

export const httpResponse = <T>(status: number, body: T, headers?: Record<string, string>) =>
  new HttpResponse(status, body, headers);

export interface ServerRoute {
  method: HttpMethod;
  path: string;
  handler: (ctx: RequestContext, req: IncomingRequest) => Promise<unknown>;
  /** Override the body limit for this route (e.g. uploads). */
  bodyLimitBytes?: number;
  /** Fastify JSON schema for docs/serialization; validation is done by the caller. */
  schema?: Record<string, unknown>;
}

export type ServerMiddleware = (ctx: RequestContext, next: () => Promise<void>, req: IncomingRequest) => Promise<void>;

export interface InjectOptions {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  payload?: unknown;
}

export interface InjectResponse {
  statusCode: number;
  headers: Record<string, string | string[] | number | undefined>;
  body: string;
  json<T = unknown>(): T;
}

export interface ServerAdapter {
  withMiddleware(fn: ServerMiddleware): this;
  register(routes: ServerRoute[]): this;
  /** Builds the underlying server without listening (idempotent). */
  ready(): Promise<void>;
  listen(port: number, host?: string): Promise<string>;
  /** In-memory request for tests; no socket. */
  inject(options: InjectOptions): Promise<InjectResponse>;
  close(): Promise<void>;
}
