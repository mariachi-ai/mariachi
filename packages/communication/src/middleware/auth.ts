import type { Context, Middleware } from '@mariachi/core';
import { AuthError } from '@mariachi/core';

export interface AuthMiddlewareOptions {
  skipAuth?: boolean;
  /** Every listed scope must be present. */
  requiredScopes?: string[];
  /** Allowed identity types (e.g. `['user', 'service']`). */
  identityTypes?: string[];
  /** Require `ctx.tenantId` to be set. */
  requireTenant?: boolean;
}

export function authMiddleware(options: AuthMiddlewareOptions = {}): Middleware {
  return async (ctx: Context, next: () => Promise<void>): Promise<void> => {
    if (options.skipAuth) return next();
    if (ctx.userId == null && ctx.identityType !== 'service') {
      throw new AuthError('auth/unauthorized', 'Authentication required');
    }
    if (options.identityTypes && !options.identityTypes.includes(ctx.identityType)) {
      throw new AuthError('auth/forbidden', `Identity type "${ctx.identityType}" is not allowed`);
    }
    if (options.requireTenant && !ctx.tenantId) {
      throw new AuthError('auth/forbidden', 'A tenant is required for this operation');
    }
    const missing = (options.requiredScopes ?? []).filter((s) => !ctx.scopes.includes(s));
    if (missing.length) {
      throw new AuthError('auth/forbidden', `Missing required scopes: ${missing.join(', ')}`, { missing });
    }
    return next();
  };
}
