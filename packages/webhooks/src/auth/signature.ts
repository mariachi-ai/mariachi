import type { IncomingRequest, RequestContext } from '@mariachi/server';
import { AuthController } from './auth-controller';
import type { WebhookIdentity } from './auth-controller';

/**
 * Abstract auth controller for webhooks that verify a signature header (e.g. HMAC-SHA256).
 * Subclasses implement verifySignature(signature, rawBody, ctx) using the provider's secret.
 * Requires rawBody on the request; ensure the server adapter preserves it (e.g. FastifyServerAdapter
 * with the application/json content-type parser that sets rawBody).
 */
export abstract class SignatureAuthController extends AuthController {
  abstract readonly provider: string;
  abstract readonly signatureHeader: string;

  /**
   * Verify the signature against the raw body and context (e.g. resolve secret from ctx).
   * Return true if the signature is valid.
   */
  protected abstract verifySignature(
    signature: string,
    rawBody: string | Buffer,
    ctx: RequestContext,
  ): Promise<boolean>;

  async auth(req: IncomingRequest, ctx: RequestContext): Promise<WebhookIdentity | null> {
    const signature = req.headers[this.signatureHeader.toLowerCase()];
    const sig = typeof signature === 'string' ? signature : Array.isArray(signature) ? signature[0] : undefined;
    if (!sig) return null;

    const rawBody = req.rawBody;
    if (rawBody === undefined || rawBody === null) {
      return null;
    }
    const bodyStr = typeof rawBody === 'string' ? rawBody : Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : '';
    if (!bodyStr) return null;

    const verified = await this.verifySignature(sig, rawBody, ctx);
    if (!verified) return null;

    return {
      provider: this.provider,
      verified: true,
      metadata: {},
    };
  }
}
