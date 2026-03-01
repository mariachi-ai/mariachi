import type { IncomingRequest, RequestContext } from '@mariachi/server';
import { AuthController, type WebhookIdentity } from '@mariachi/webhooks';
import { extractSvixHeaders, verifyClerkWebhook } from './verify';

/**
 * Webhook auth controller that verifies Clerk/Svix signatures.
 * For use with `@mariachi/webhooks` WebhookServer.
 */
export class ClerkWebhookAuth extends AuthController {
  constructor(private readonly signingSecret: string) {
    super();
  }

  async auth(req: IncomingRequest, _ctx: RequestContext): Promise<WebhookIdentity | null> {
    const svixHeaders = extractSvixHeaders(req.headers);
    if (!svixHeaders) return null;

    try {
      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      verifyClerkWebhook(this.signingSecret, body, svixHeaders);
      return {
        provider: 'clerk',
        verified: true,
        metadata: { svixId: svixHeaders['svix-id'] },
      };
    } catch {
      return null;
    }
  }
}
