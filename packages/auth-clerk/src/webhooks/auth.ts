import type { IncomingRequest, RequestContext } from '@mariachi/server';
import { AuthController, type WebhookIdentity } from '@mariachi/webhooks';
import { extractSvixHeaders, verifyClerkWebhook } from './verify';

/**
 * Webhook auth controller that verifies Clerk/Svix signatures against the exact raw request bytes.
 * For use with `@mariachi/webhooks` WebhookServer.
 */
export class ClerkWebhookAuth extends AuthController {
  constructor(private readonly signingSecret: string) {
    super();
  }

  async auth(req: IncomingRequest, ctx: RequestContext): Promise<WebhookIdentity | null> {
    const svixHeaders = extractSvixHeaders(req.headers);
    if (!svixHeaders) return null;
    if (req.rawBody === undefined) {
      ctx.logger.error({}, 'Clerk webhook received without rawBody; signature cannot be verified');
      return null;
    }
    try {
      verifyClerkWebhook(this.signingSecret, req.rawBody, svixHeaders);
      return { provider: 'clerk', verified: true, metadata: { svixId: svixHeaders['svix-id'] } };
    } catch {
      return null;
    }
  }
}
