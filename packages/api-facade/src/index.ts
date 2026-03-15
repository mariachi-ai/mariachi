export { FastifyAdapter } from './server';
export type { ServerConfig } from '@mariachi/server';
export type {
  AuthStrategy,
  RateLimitConfig,
  RouteDefinition,
  ResolvedIdentity,
  RequestIdentity,
  HttpContext,
  HttpMiddleware,
  AuthResolver,
} from './types';
export { BaseController } from './controller';
export type { RouteOpts, RouteHandler } from './controller';
export { resolveAuth } from './auth/resolver';
export { SessionStrategy } from './auth/strategies/session';
export { ApiKeyStrategy } from './auth/strategies/api-key';
export { WebhookStrategy } from './auth/strategies/webhook';
export { ServiceStrategy } from './auth/strategies/service';
export { createRouter } from './router';
