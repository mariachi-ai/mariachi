/**
 * `@mariachi/server` is the HTTP transport: parsing (raw body kept), request/trace ids, CORS,
 * security headers, request spans, error envelopes and graceful shutdown. It knows nothing about
 * users. Policy — authentication, tenancy, validation, rate limits, OpenAPI — lives in
 * `@mariachi/api-facade` (APIs) and `@mariachi/webhooks` (inbound webhooks), both built on this.
 */
export { FastifyServerAdapter, joinPath } from './adapters/fastify';
export { contextFromRequest, traceIdFromTraceparent, type RequestIdentity } from './context';
export { HttpResponse, httpResponse } from './types';
export type {
  HttpMethod,
  CorsOptions,
  SecurityHeadersOptions,
  ServerConfig,
  RequestContext,
  IncomingRequest,
  ServerRoute,
  ServerMiddleware,
  ServerAdapter,
  InjectOptions,
  InjectResponse,
} from './types';
