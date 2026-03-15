import type { Context } from '@mariachi/core';

export type AuthStrategy = 'session' | 'api-key' | 'service' | 'webhook';

export interface RateLimitConfig {
  perUser?: number;
  perApiKey?: number;
  window?: string;
}

export interface RequestIdentity {
  userId: string;
  tenantId: string;
  scopes: string[];
  identityType: AuthStrategy;
  apiKeyId?: string;
  sessionId?: string;
}

export interface HttpContext extends Context {
  identity: RequestIdentity | null;
  locals: Record<string, unknown>;
}

export type HttpMiddleware = (
  ctx: HttpContext,
  next: () => Promise<void>,
) => Promise<void>;

export type AuthResolver = (
  req: import('@mariachi/server').IncomingRequest,
  strategies: AuthStrategy[],
) => Promise<ResolvedIdentity | null> | ResolvedIdentity | null;

export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  handler: (
    ctx: HttpContext,
    body: unknown,
    params: Record<string, string>,
    query: Record<string, string>,
  ) => Promise<unknown>;
  auth?: AuthStrategy | AuthStrategy[] | false;
  rateLimit?: { maxRequests: number; windowMs: number };
}

export interface ResolvedIdentity {
  userId: string;
  tenantId: string;
  scopes: string[];
  identityType: AuthStrategy;
  apiKeyId?: string;
  sessionId?: string;
}
