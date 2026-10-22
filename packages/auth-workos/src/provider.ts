import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { AuthError } from '@mariachi/core';
import type { AuthProvider, AuthProviderWebhookConfig, ResolvedIdentity } from '@mariachi/auth';
import type { AsymmetricAlgorithm, WorkOSConfig, WorkOSJwtPayload } from './types';
import { WorkOSWebhookHandler } from './webhooks/handler';

const HMAC = /^HS/i;
const DEFAULT_API_HOSTNAME = 'api.workos.com';

function strings(v: unknown): string[] {
  if (typeof v === 'string' && v) return [v];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
  return [];
}

/**
 * Verifies access tokens issued by WorkOS AuthKit against its JWKS and maps them onto
 * `ResolvedIdentity`:
 *
 * - `sub` → `userId`, `sid` → `sessionId`, `org_id` → `tenantId`;
 * - `role` and `roles` → `roles`; `scopes` is `permissions` plus the space-separated `scope` claim;
 * - the whole verified payload (`act`, `entitlements`, `feature_flags`, `client_id`, …) → `claims`.
 *
 * AuthKit session tokens carry no `aud`, so by default the token must name this environment in
 * `client_id` instead. Tokens AuthKit issues as an OAuth server (MCP) are checked with that
 * server's JWKS, issuer and audience (see `WorkOSConfig`).
 */
export class WorkOSAuthProvider implements AuthProvider {
  readonly name = 'workos';

  private readonly jwks: JWTVerifyGetKey;
  private readonly issuer: string | string[];
  private readonly algorithms: AsymmetricAlgorithm[];
  private readonly requireClientId: boolean;
  private readonly clockTolerance: number;

  constructor(private readonly config: WorkOSConfig, jwks?: JWTVerifyGetKey) {
    if (!config.clientId) throw new AuthError('auth/invalid-config', 'WorkOS: `clientId` is required');
    const host = config.apiHostname ?? DEFAULT_API_HOSTNAME;
    this.algorithms = config.algorithms?.length ? config.algorithms : ['RS256'];
    if (this.algorithms.some((a) => HMAC.test(a))) {
      throw new AuthError('auth/invalid-config', 'WorkOS: HMAC algorithms are not accepted; verify through the JWKS');
    }
    this.issuer = config.issuer ?? `https://${host}/user_management/${config.clientId}`;
    this.requireClientId = config.requireClientId ?? true;
    this.clockTolerance = config.clockToleranceSeconds ?? 5;
    this.jwks =
      jwks ??
      createRemoteJWKSet(new URL(config.jwksUrl ?? `https://${host}/sso/jwks/${config.clientId}`), {
        cacheMaxAge: config.jwksCacheMaxAgeMs ?? 600_000,
        cooldownDuration: config.jwksCooldownMs ?? 30_000,
      });
  }

  async verify(token: string): Promise<ResolvedIdentity> {
    let payload: WorkOSJwtPayload;
    try {
      const result = await jwtVerify(token, this.jwks, {
        algorithms: this.algorithms,
        issuer: this.issuer,
        audience: this.config.audience,
        clockTolerance: this.clockTolerance,
        requiredClaims: ['sub', 'exp'],
      });
      payload = result.payload as WorkOSJwtPayload;
    } catch (error) {
      throw new AuthError('auth/invalid-token', `WorkOS token verification failed: ${(error as Error).message}`);
    }
    if (this.requireClientId && payload.client_id !== undefined && payload.client_id !== this.config.clientId) {
      throw new AuthError('auth/invalid-token', 'WorkOS token verification failed: issued for another client');
    }
    return this.toIdentity(payload);
  }

  /** The mapping `verify` applies to a verified payload. */
  toIdentity(payload: WorkOSJwtPayload): ResolvedIdentity {
    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new AuthError('auth/invalid-token', 'WorkOS token has no subject');
    }
    const roles = [...new Set([...strings(payload.role), ...strings(payload.roles)])];
    const scopes = [
      ...new Set([
        ...strings(payload.permissions),
        ...(typeof payload.scope === 'string' ? payload.scope.split(/\s+/).filter(Boolean) : []),
      ]),
    ];
    return {
      userId: payload.sub,
      tenantId: typeof payload.org_id === 'string' ? payload.org_id : '',
      scopes,
      roles,
      identityType: 'session',
      sessionId: typeof payload.sid === 'string' ? payload.sid : undefined,
      claims: { ...payload },
    };
  }

  /** A handler for WorkOS webhooks. `secret` is the endpoint's signing secret from the Dashboard. */
  createWebhookHandler(config: AuthProviderWebhookConfig): WorkOSWebhookHandler {
    return new WorkOSWebhookHandler({ secret: config.secret });
  }
}
