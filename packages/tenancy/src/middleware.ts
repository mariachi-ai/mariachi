import type { Context, Middleware } from '@mariachi/core';
import { TenancyError } from '@mariachi/core';
import { createTenantResolver } from './resolver';
import type { TenancyConfig, TenantResolverInput } from './types';

export interface TenancyContext extends Context {
  hostname?: string;
  headers?: Record<string, string | undefined>;
  jwtClaims?: Record<string, unknown>;
  path?: string;
}

function toResolverInput(ctx: TenancyContext): TenantResolverInput {
  return {
    hostname: ctx.hostname ?? ctx.server,
    headers: ctx.headers,
    jwtClaims: ctx.jwtClaims,
    path: ctx.path,
  };
}

export function createTenancyMiddleware(config: TenancyConfig): Middleware {
  const resolver = createTenantResolver(config);

  return async (ctx: Context, next: () => Promise<void>): Promise<void> => {
    const input = toResolverInput(ctx as TenancyContext);
    const tenantId = resolver.resolve(input);

    if (tenantId != null) {
      (ctx as Context & { tenantId: string }).tenantId = tenantId;
    }

    if (config.required === true && tenantId == null) {
      throw new TenancyError('tenancy/missing-tenant', 'Tenant identification is required');
    }

    await next();
  };
}
