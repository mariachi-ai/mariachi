import { AuthError } from '@mariachi/core';
import type { Context, Middleware } from '@mariachi/core';
import type { AuthProvider } from '@mariachi/auth';

export interface ClerkMiddlewareOptions {
  /**
   * Extract the session token from the context.
   * Defaults to reading `ctx.token` (set by HTTP adapters from the Authorization header).
   */
  getToken?: (ctx: Context) => string | null;
}

export function createClerkMiddleware(
  provider: AuthProvider,
  options?: ClerkMiddlewareOptions,
): Middleware {
  const getToken =
    options?.getToken ??
    ((ctx: Context) => (ctx as Context & { token?: string }).token ?? null);

  return async (ctx, next) => {
    const token = getToken(ctx);
    if (!token) {
      throw new AuthError('auth/unauthorized', 'Missing session token');
    }

    const identity = await provider.verify(token);
    ctx.userId = identity.userId;
    ctx.tenantId = identity.tenantId;
    ctx.scopes = identity.scopes;
    ctx.identityType = identity.identityType;
    ctx.sessionId = identity.sessionId;

    await next();
  };
}
