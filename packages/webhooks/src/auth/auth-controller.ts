import type { IncomingRequest, RequestContext } from '@mariachi/server';

export interface WebhookIdentity {
  provider: string;
  verified: boolean;
  /** Tenant the delivery belongs to (resolved from the signing secret, path, or payload). */
  tenantId?: string;
  /** Provider event/delivery id, used for deduplication when an idempotency store is configured. */
  eventId?: string;
  metadata?: Record<string, unknown>;
}

export abstract class AuthController {
  /** Return null when the request is not authentic. Never trust `req.body` for signatures; use `req.rawBody`. */
  abstract auth(req: IncomingRequest, ctx: RequestContext): Promise<WebhookIdentity | null>;
}
