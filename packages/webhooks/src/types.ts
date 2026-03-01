import type { RequestContext } from '@mariachi/server';
import type { WebhookIdentity } from './auth/auth-controller';

export interface WebhookContext extends RequestContext {
  identity: WebhookIdentity;
}

export interface WebhookRouteOpts {
  mode: 'direct' | 'queue';
  /** Procedure name for `@mariachi/communication`. Required when mode is 'direct'. */
  procedure?: string;
  /** Job name for `@mariachi/jobs`. Required when mode is 'queue'. */
  jobName?: string;
  /** Log retention duration, e.g. '7d', '30d', '90d'. */
  ttl?: string;
}

export type WebhookHandler = (
  ctx: WebhookContext,
  body: unknown,
  params: Record<string, string>,
  query: Record<string, string>,
) => Promise<unknown>;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface WebhookRouteDefinition {
  method: HttpMethod;
  path: string;
  opts: WebhookRouteOpts;
  handler: WebhookHandler;
  controllerPrefix: string;
}
