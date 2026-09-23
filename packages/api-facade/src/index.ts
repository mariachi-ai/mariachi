export { FastifyAdapter, createApiServer } from './server';
export { BaseController } from './controller';
export { generateOpenApi } from './openapi';
export {
  bearerStrategy,
  apiKeyStrategy,
  serviceTokenStrategy,
  hmacSignatureStrategy,
  type TokenVerifier,
  type ServiceTokenOptions,
  type HmacSignatureOptions,
} from './auth/strategies';
export { HttpResponse, httpResponse } from '@mariachi/server';
export type { ServerConfig, CorsOptions } from '@mariachi/server';
export type {
  ApiServerConfig,
  AuthStrategy,
  AuthStrategyHandler,
  ResolvedIdentity,
  RequestIdentity,
  HttpContext,
  HttpMiddleware,
  RouteSchemas,
  RouteHandler,
  RouteOpts,
  RouteDefinition,
  RateLimitSettings,
  RateLimitConfig,
  OpenApiSettings,
  HealthSource,
  AuthResolver,
} from './types';
