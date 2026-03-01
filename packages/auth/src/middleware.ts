import { AuthError } from '@mariachi/core';
import type { Context, Middleware } from '@mariachi/core';
import type { AuthenticationAdapter } from './types';

export interface AuthMiddlewareOptions {
  getToken?: (ctx: Context) => string | null;
}

export function createAuthMiddleware(
  adapter: AuthenticationAdapter,
  options?: AuthMiddlewareOptions,
): Middleware {
  const getToken =
    options?.getToken ??
    ((ctx: Context) => (ctx as Context & { token?: string }).token ?? null);

  return async (ctx, next) => {
    const token = getToken(ctx);
    if (!token) {
      throw new AuthError('auth/unauthorized', 'Missing or invalid token');
    }
    try {
      const identity = await adapter.verify(token);
      ctx.userId = identity.userId;
      ctx.tenantId = identity.tenantId;
      ctx.scopes = identity.scopes;
      ctx.identityType = identity.identityType;
      ctx.apiKeyId = identity.apiKeyId;
      ctx.sessionId = identity.sessionId;
      await next();
    } catch {
      throw new AuthError('auth/unauthorized', 'Token verification failed');
    }
  };
}
