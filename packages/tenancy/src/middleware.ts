import type { Context, Middleware } from '@mariachi/core';
import type { Tenancy } from './tenancy';
import type { TenantRecord, TenantResolverInput } from './types';

export interface TenancyContext extends Context {
  hostname?: string;
  headers?: Record<string, string | string[] | undefined>;
  /** The verified token's claims, as `@mariachi/auth`'s `createAuthMiddleware` sets them. */
  jwtClaims?: Record<string, unknown>;
  path?: string;
  /** HTTP facade contexts expose the request here. */
  request?: { headers: Record<string, string | string[] | undefined>; url: string };
  /** HTTP facade contexts expose the verified identity here; providers put the token's claims in `claims`. */
  identity?: { claims?: Record<string, unknown> } | null;
  tenant?: TenantRecord | null;
}

function toResolverInput(ctx: TenancyContext): TenantResolverInput {
  const headers = ctx.headers ?? ctx.request?.headers;
  const host = headers?.host;
  return {
    hostname: ctx.hostname ?? (Array.isArray(host) ? host[0] : host),
    headers,
    jwtClaims: ctx.jwtClaims ?? ctx.identity?.claims,
    path: ctx.path ?? ctx.request?.url,
  };
}

/**
 * Establishes the tenant for each call and sets `ctx.tenantId` / `ctx.tenant`. Works as a
 * communication middleware and as an api-facade `HttpMiddleware`. The `jwt-claim` strategy reads
 * `ctx.jwtClaims` (set by `createAuthMiddleware`) or, on an HTTP context, `ctx.identity.claims`.
 */
export function createTenancyMiddleware(tenancy: Tenancy): Middleware {
  return async (ctx: Context, next: () => Promise<void>): Promise<void> => {
    const tctx = ctx as TenancyContext;
    const record = await tenancy.establish(ctx, toResolverInput(tctx));
    if (record) {
      (ctx as { tenantId: string | null }).tenantId = record.id;
      tctx.tenant = record;
    }
    await next();
  };
}
