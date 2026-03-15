import { createHash, createHmac, createPublicKey, verify } from 'crypto';
import type { AuthWebhookHandler, AuthWebhookEvent } from '@mariachi/auth';

const SIGNATURE_HEADER = 'X-FusionAuth-Signature-JWT';

function base64UrlDecode(str: string): Buffer {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
  return Buffer.from(padded, 'base64');
}

/**
 * Verify FusionAuth webhook JWT synchronously using a configured key.
 * Use webhookSigningPublicKeyPem for RSA/EC-signed webhooks, or
 * webhookSigningSecret for HMAC-signed webhooks (FusionAuth Key Master).
 */
export interface FusionAuthWebhookHandlerConfig {
  /** FusionAuth server base URL (for consistency with provider config) */
  serverUrl: string;
  /** Secret from AuthProviderWebhookConfig (Clerk-style); used as HMAC key when no PEM is set */
  secret: string;
  /**
   * Optional. RSA/EC public key (PEM) from FusionAuth Key Master for webhook signing.
   * When set, the JWT signature is verified with this key (sync). When unset, secret is used as HMAC key.
   */
  webhookSigningPublicKeyPem?: string;
}

/** Normalizes FusionAuth event type (e.g. user.action) to framework AuthEventType-style */
function normalizeEventType(fusionType: string): string {
  const lower = fusionType.toLowerCase();
  if (lower.includes('user.create') || lower === 'user.action') return 'user.created';
  if (lower.includes('user.update')) return 'user.updated';
  if (lower.includes('user.delete')) return 'user.deleted';
  if (lower.includes('session')) return lower.includes('end') ? 'session.ended' : 'session.created';
  return lower.replace(/\./g, '_');
}

export class FusionAuthWebhookHandler implements AuthWebhookHandler {
  private readonly config: FusionAuthWebhookHandlerConfig;

  constructor(config: FusionAuthWebhookHandlerConfig) {
    this.config = config;
  }

  verify(
    rawBody: string | Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): AuthWebhookEvent {
    const raw = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
    const signatureJwt = headers[SIGNATURE_HEADER.toLowerCase()];
    const jwtString = Array.isArray(signatureJwt) ? signatureJwt[0] : signatureJwt;
    if (!jwtString || typeof jwtString !== 'string') {
      throw new Error('FusionAuth webhook: missing X-FusionAuth-Signature-JWT header');
    }

    const parts = jwtString.split('.');
    if (parts.length !== 3) {
      throw new Error('FusionAuth webhook: invalid JWT format');
    }
    const [headerB64, payloadB64, sigB64] = parts;
    const payloadJson = base64UrlDecode(payloadB64).toString('utf8');
    const payload = JSON.parse(payloadJson) as { request_body_sha256?: string };
    const bodySha256 = createHash('sha256').update(raw).digest('base64');
    if (payload.request_body_sha256 !== bodySha256) {
      throw new Error('FusionAuth webhook: request body hash does not match signature');
    }

    const signedData = Buffer.from(`${headerB64}.${payloadB64}`, 'utf8');
    const sigBuffer = base64UrlDecode(sigB64);
    const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8')) as { alg?: string };
    const alg = (header.alg ?? 'RS256').toUpperCase();

    if (this.config.webhookSigningPublicKeyPem) {
      const nodeAlg = alg === 'RS256' ? 'RSA-SHA256' : alg === 'RS384' ? 'RSA-SHA384' : alg === 'RS512' ? 'RSA-SHA512' : 'RSA-SHA256';
      const key = createPublicKey(this.config.webhookSigningPublicKeyPem);
      const ok = verify(nodeAlg, signedData, key, sigBuffer);
      if (!ok) {
        throw new Error('FusionAuth webhook: signature verification failed');
      }
    } else {
      const expectedSig = createHmac('sha256', this.config.secret)
        .update(signedData)
        .digest();
      if (expectedSig.length !== sigBuffer.length || !expectedSig.equals(sigBuffer)) {
        throw new Error('FusionAuth webhook: HMAC signature verification failed');
      }
    }

    const body = JSON.parse(raw.toString('utf8')) as {
      event?: { type?: string; createInstant?: number; id?: string; user?: unknown };
      [k: string]: unknown;
    };
    const event = body.event ?? body;
    const type = (event.type as string) ?? 'unknown';
    const id = (event.id as string) ?? (body.id as string) ?? `fa-${Date.now()}`;
    const createInstant = (event.createInstant as number) ?? (body.createInstant as number);
    const timestamp = createInstant != null ? createInstant : undefined;

    return {
      id: String(id),
      type: normalizeEventType(type),
      provider: 'fusionauth',
      data: (event.user ?? event) as Record<string, unknown>,
      raw: body,
      timestamp,
    };
  }
}
