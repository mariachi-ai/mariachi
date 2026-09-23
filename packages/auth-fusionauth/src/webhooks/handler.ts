import { createHash, createPublicKey, type KeyObject } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { AuthError } from '@mariachi/core';
import type { AuthWebhookHandler, AuthWebhookEvent } from '@mariachi/auth';

const SIGNATURE_HEADER = 'x-fusionauth-signature-jwt';

export interface FusionAuthWebhookHandlerConfig {
  /** FusionAuth server base URL. Used for JWKS lookup when no key or secret is configured. */
  serverUrl: string;
  /** HMAC secret for HS256/384/512-signed webhooks. */
  secret?: string;
  /** RSA/EC public key (PEM) from Key Master for asymmetrically signed webhooks. */
  webhookSigningPublicKeyPem?: string;
  /** Use the server's JWKS endpoint to resolve the signing key. Default: true when no key/secret. */
  useJwks?: boolean;
  /** Reject signatures older than this. Default 300s. */
  maxAgeSeconds?: number;
}

const EVENT_TYPE_MAP: Record<string, string> = {
  'user.create': 'user.created',
  'user.create.complete': 'user.created',
  'user.registration.create': 'user.created',
  'user.update': 'user.updated',
  'user.update.complete': 'user.updated',
  'user.registration.update': 'user.updated',
  'user.delete': 'user.deleted',
  'user.delete.complete': 'user.deleted',
  'user.registration.delete': 'user.deleted',
  'user.login.success': 'session.created',
  'jwt.refresh-token.revoke': 'session.revoked',
  'user.deactivate': 'user.updated',
  'user.reactivate': 'user.updated',
  'group.create': 'organization.created',
  'group.update': 'organization.updated',
  'group.delete': 'organization.deleted',
  'group.member.add': 'organizationMembership.created',
  'group.member.update': 'organizationMembership.updated',
  'group.member.remove': 'organizationMembership.deleted',
};

/** Maps FusionAuth event types onto the framework's `AuthEventType` vocabulary; unknown types pass through. */
export function normalizeFusionAuthEventType(fusionType: string): string {
  return EVENT_TYPE_MAP[fusionType] ?? fusionType;
}

/**
 * Verifies FusionAuth webhook signatures (`X-FusionAuth-Signature-JWT`): the JWT signature, its
 * `exp`/`iat`, algorithm allowlist, and the `request_body_sha256` claim against the raw body.
 */
export class FusionAuthWebhookHandler implements AuthWebhookHandler {
  private readonly key: Uint8Array | KeyObject | JWTVerifyGetKey;
  private readonly algorithms: string[];

  constructor(private readonly config: FusionAuthWebhookHandlerConfig) {
    if (config.webhookSigningPublicKeyPem) {
      this.key = createPublicKey(config.webhookSigningPublicKeyPem);
      this.algorithms = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'PS256', 'PS384', 'PS512'];
    } else if (config.secret && config.useJwks !== true) {
      this.key = new TextEncoder().encode(config.secret);
      this.algorithms = ['HS256', 'HS384', 'HS512'];
    } else {
      const base = config.serverUrl.replace(/\/$/, '');
      this.key = createRemoteJWKSet(new URL('/.well-known/jwks.json', base));
      this.algorithms = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'PS256', 'PS384', 'PS512'];
    }
  }

  async verify(rawBody: string | Buffer, headers: Record<string, string | string[] | undefined>): Promise<AuthWebhookEvent> {
    const raw = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
    const header = headers[SIGNATURE_HEADER];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token) throw new AuthError('auth/webhook-verification-failed', 'Missing X-FusionAuth-Signature-JWT header');

    let payload: Record<string, unknown>;
    try {
      const result = await jwtVerify(token, this.key as Parameters<typeof jwtVerify>[1], {
        algorithms: this.algorithms,
        maxTokenAge: this.config.maxAgeSeconds ?? 300,
        clockTolerance: 5,
      });
      payload = result.payload as Record<string, unknown>;
    } catch (error) {
      throw new AuthError('auth/webhook-verification-failed', 'FusionAuth webhook signature invalid', {
        reason: (error as Error).message,
      });
    }

    const bodySha256 = createHash('sha256').update(raw).digest('base64');
    if (payload.request_body_sha256 !== bodySha256) {
      throw new AuthError('auth/webhook-verification-failed', 'FusionAuth webhook body hash mismatch');
    }

    let body: { event?: Record<string, unknown> } & Record<string, unknown>;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      throw new AuthError('auth/webhook-invalid-payload', 'FusionAuth webhook body is not JSON');
    }
    const event = (body.event ?? body) as Record<string, unknown>;
    const type = typeof event.type === 'string' ? event.type : 'unknown';
    const id = typeof event.id === 'string' ? event.id : createHash('sha256').update(raw).digest('hex');
    const createInstant = typeof event.createInstant === 'number' ? event.createInstant : undefined;

    return {
      id,
      type: normalizeFusionAuthEventType(type),
      provider: 'fusionauth',
      tenantId: typeof event.tenantId === 'string' ? event.tenantId : undefined,
      data: (event.user ?? event.group ?? event) as Record<string, unknown>,
      raw: body,
      timestamp: createInstant,
    };
  }
}
