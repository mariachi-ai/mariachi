import type { IncomingRequest, RequestContext } from '@mariachi/server';

export interface WebhookIdentity {
  provider: string;
  verified: boolean;
  metadata?: Record<string, unknown>;
}

export abstract class AuthController {
  abstract auth(req: IncomingRequest, ctx: RequestContext): Promise<WebhookIdentity | null>;
}
