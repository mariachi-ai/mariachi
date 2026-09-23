import type { IncomingRequest, RequestContext } from '@mariachi/server';
import { AuthController } from './auth-controller';
import type { WebhookIdentity } from './auth-controller';

/**
 * Base for webhooks that verify a signature header (e.g. HMAC-SHA256) over the exact raw body.
 * Subclasses implement `verifySignature`; use `crypto.timingSafeEqual` for comparisons.
 */
export abstract class SignatureAuthController extends AuthController {
  abstract readonly provider: string;
  abstract readonly signatureHeader: string;
  /** Header carrying the provider's delivery id, used for dedup. */
  protected readonly eventIdHeader?: string;

  protected abstract verifySignature(signature: string, rawBody: Buffer, ctx: RequestContext, req: IncomingRequest): Promise<boolean>;

  /** Override to map a delivery to a tenant (e.g. from a path param or payload field). */
  protected resolveTenant(_req: IncomingRequest): string | undefined {
    return undefined;
  }

  async auth(req: IncomingRequest, ctx: RequestContext): Promise<WebhookIdentity | null> {
    const signature = req.headers[this.signatureHeader.toLowerCase()];
    const sig = typeof signature === 'string' ? signature : Array.isArray(signature) ? signature[0] : undefined;
    if (!sig) return null;
    if (!req.rawBody || req.rawBody.length === 0) {
      ctx.logger.warn({ provider: this.provider }, 'webhook has no raw body; rejecting');
      return null;
    }
    if (!(await this.verifySignature(sig, req.rawBody, ctx, req))) return null;
    const eventId = this.eventIdHeader ? req.headers[this.eventIdHeader.toLowerCase()] : undefined;
    return {
      provider: this.provider,
      verified: true,
      tenantId: this.resolveTenant(req),
      eventId: typeof eventId === 'string' ? eventId : undefined,
      metadata: {},
    };
  }
}
