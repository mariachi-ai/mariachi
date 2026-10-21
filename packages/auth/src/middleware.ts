import { AuthError, MariachiError } from '@mariachi/core';
import type { Context, Middleware } from '@mariachi/core';
import type { AuthenticationAdapter } from './types';

export interface AuthMiddlewareOptions {
  getToken?: (ctx: Context) => string | null;
}

/**
 * The context after `createAuthMiddleware`: `Context` plus the verified token's claims
 * (`ResolvedIdentity.claims`), which tenancy's `jwt-claim` strategy and provider-specific code read.
 */
export interface AuthenticatedContext extends Context {
  jwtClaims?: Record<string, unknown>;
}

export function createAuthMiddleware(adapter: AuthenticationAdapter, options?: AuthMiddlewareOptions): Middleware {
  const getToken = options?.getToken ?? ((ctx: Context) => (ctx as Context & { token?: string }).token ?? null);

  return async (ctx, next) => {
    const token = getToken(ctx);
    if (!token) throw new AuthError('auth/unauthorized', 'Missing or invalid token');
    let identity: Awaited<ReturnType<AuthenticationAdapter['verify']>>;
    try {
      identity = await adapter.verify(token);
    } catch (error) {
      if (error instanceof MariachiError && error.code.startsWith('auth/')) throw error;
      throw new AuthError('auth/unauthorized', 'Token verification failed');
    }
    ctx.userId = identity.userId;
    ctx.tenantId = identity.tenantId;
    ctx.scopes = identity.scopes;
    ctx.identityType = identity.identityType;
    ctx.apiKeyId = identity.apiKeyId;
    ctx.sessionId = identity.sessionId;
    (ctx as AuthenticatedContext).jwtClaims = identity.claims;
    await next();
  };
}
