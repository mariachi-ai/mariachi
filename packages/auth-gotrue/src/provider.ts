import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { AuthError } from '@mariachi/core';
import type { AuthProvider, AuthProviderWebhookConfig, ResolvedIdentity } from '@mariachi/auth';
import type { AsymmetricAlgorithm, GoTrueConfig, GoTrueJwtPayload } from './types';
import { GoTrueWebhookHandler } from './webhooks/handler';

const HMAC = /^HS/i;

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function strings(v: unknown): string[] {
  if (typeof v === 'string' && v) return [v];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
  return [];
}

/**
 * Verifies access tokens issued by GoTrue (Supabase Auth) against its JWKS and maps them onto
 * `ResolvedIdentity`:
 *
 * - `sub` → `userId`, `session_id` → `sessionId`;
 * - the org claim (`org_id` by default, added by a custom access-token hook) → `tenantId`;
 * - `role` (GoTrue's Postgres role, e.g. `authenticated`), a `roles` array and the org role claim
 *   (`org_role` by default) → `roles`; `scopes` is `roles` plus the space-separated `scope` claim;
 * - the whole verified payload (`aal`, `amr`, `act`, `is_anonymous`, `app_metadata`, …) → `claims`.
 */
export class GoTrueAuthProvider implements AuthProvider {
  readonly name = 'gotrue';

  private readonly jwks: JWTVerifyGetKey;
  private readonly issuer: string;
  private readonly audience: string | string[];
  private readonly algorithms: AsymmetricAlgorithm[];
  private readonly orgClaim: string;
  private readonly orgRoleClaim: string;
  private readonly clockTolerance: number;

  constructor(private readonly config: GoTrueConfig, jwks?: JWTVerifyGetKey) {
    if (!config.url) throw new AuthError('auth/invalid-config', 'GoTrue: `url` is required');
    const base = trimSlash(config.url);
    this.algorithms = config.algorithms?.length ? config.algorithms : ['ES256'];
    if (this.algorithms.some((a) => HMAC.test(a))) {
      throw new AuthError('auth/invalid-config', 'GoTrue: HMAC algorithms are not accepted; verify through the JWKS');
    }
    this.issuer = config.issuer ?? base;
    this.audience = config.audience ?? 'authenticated';
    this.orgClaim = config.orgClaim ?? 'org_id';
    this.orgRoleClaim = config.orgRoleClaim ?? 'org_role';
    this.clockTolerance = config.clockToleranceSeconds ?? 5;
    this.jwks =
      jwks ??
      createRemoteJWKSet(new URL(config.jwksUrl ?? `${base}/.well-known/jwks.json`), {
        cacheMaxAge: config.jwksCacheMaxAgeMs ?? 60_000,
        cooldownDuration: config.jwksCooldownMs ?? 5_000,
      });
  }

  async verify(token: string): Promise<ResolvedIdentity> {
    let payload: GoTrueJwtPayload;
    try {
      const result = await jwtVerify(token, this.jwks, {
        algorithms: this.algorithms,
        issuer: this.issuer,
        audience: this.audience,
        clockTolerance: this.clockTolerance,
        requiredClaims: ['sub', 'exp'],
      });
      payload = result.payload as GoTrueJwtPayload;
    } catch (error) {
      throw new AuthError('auth/invalid-token', `GoTrue token verification failed: ${(error as Error).message}`);
    }
    return this.toIdentity(payload);
  }

  /** The mapping `verify` applies to a verified payload. */
  toIdentity(payload: GoTrueJwtPayload): ResolvedIdentity {
    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new AuthError('auth/invalid-token', 'GoTrue token has no subject');
    }
    const roles = [...new Set([...strings(payload.role), ...strings(payload.roles), ...strings(payload[this.orgRoleClaim])])];
    const scopes = [...new Set([...roles, ...(typeof payload.scope === 'string' ? payload.scope.split(/\s+/).filter(Boolean) : [])])];
    const org = payload[this.orgClaim];
    return {
      userId: payload.sub,
      tenantId: typeof org === 'string' ? org : '',
      scopes,
      roles,
      identityType: 'session',
      sessionId: typeof payload.session_id === 'string' ? payload.session_id : undefined,
      claims: { ...payload },
    };
  }

  /**
   * A handler for GoTrue's HTTP hooks (Standard Webhooks). `secret` is the hook's secret as GoTrue
   * takes it (`v1,whsec_<base64>`), several separated by `|` during a rotation.
   */
  createWebhookHandler(config: AuthProviderWebhookConfig): GoTrueWebhookHandler {
    return new GoTrueWebhookHandler({ secret: config.secret, orgClaim: this.orgClaim });
  }
}
