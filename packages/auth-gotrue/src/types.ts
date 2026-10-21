export interface GoTrueConfig {
  /**
   * GoTrue's public base URL, path prefix included (e.g. `https://app.example.com/auth/v1`).
   * The JWKS is read from `<url>/.well-known/jwks.json` unless `jwksUrl` is set.
   */
  url: string;
  /** Where to read the JWKS from, when it isn't `<url>/.well-known/jwks.json` (e.g. an internal address). */
  jwksUrl?: string;
  /**
   * The `iss` every token must carry. Defaults to `url`. GoTrue sets `iss` only when
   * `GOTRUE_JWT_ISSUER` is configured, so configure it to the same value.
   */
  issuer?: string;
  /** The `aud` every token must carry. Default `authenticated` (GoTrue's `GOTRUE_JWT_AUD`). */
  audience?: string | string[];
  /** Accepted signing algorithms. Default `['ES256']`; never include an HMAC algorithm. */
  algorithms?: AsymmetricAlgorithm[];
  /** The claim holding the organization (→ `tenantId`). Default `org_id`. */
  orgClaim?: string;
  /** The claim holding the role in that organization (added to `roles`). Default `org_role`. */
  orgRoleClaim?: string;
  /**
   * How long a fetched JWKS is trusted before it's fetched again, in ms. Default 60 000. Keep it
   * short: after a key rotation (or a fork that changes the key) tokens signed with the old key
   * keep verifying until the cached set expires.
   */
  jwksCacheMaxAgeMs?: number;
  /** The least time between two JWKS fetches caused by an unknown `kid`, in ms. Default 5 000. */
  jwksCooldownMs?: number;
  /** Clock skew allowed on `exp`/`nbf`/`iat`, in seconds. Default 5. */
  clockToleranceSeconds?: number;
}

export type AsymmetricAlgorithm = 'ES256' | 'ES384' | 'ES512' | 'RS256' | 'RS384' | 'RS512' | 'PS256' | 'PS384' | 'PS512' | 'EdDSA';

/** An AMR entry as GoTrue writes it in access tokens. */
export interface GoTrueAmrEntry {
  method: string;
  timestamp: number;
  provider?: string;
}

/** GoTrue access-token claims (the ones this package reads; the rest stay in `claims`). */
export interface GoTrueJwtPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  email?: string;
  phone?: string;
  role?: string;
  roles?: unknown;
  scope?: string;
  aal?: string;
  amr?: GoTrueAmrEntry[];
  session_id?: string;
  is_anonymous?: boolean;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  /** Set on impersonation ("view as") tokens: who is acting. */
  act?: Record<string, unknown>;
  [claim: string]: unknown;
}
