import type { Context, Middleware } from '@mariachi/core';
import { CommunicationError } from '@mariachi/core';

export interface AuthMiddlewareOptions {
  skipAuth?: boolean;
}

export function authMiddleware(options: AuthMiddlewareOptions = {}): Middleware {
  const { skipAuth = false } = options;

  return async (ctx: Context, next: () => Promise<void>): Promise<void> => {
    if (skipAuth) {
      return next();
    }
    if (ctx.userId == null) {
      throw new CommunicationError('communication/unauthorized', 'Authentication required');
    }
    return next();
  };
}
