export type AsymmetricAlgorithm = 'RS256' | 'RS384' | 'RS512' | 'PS256' | 'PS384' | 'PS512' | 'ES256' | 'ES384' | 'ES512' | 'EdDSA';

export interface WorkOSConfig {
  /** The WorkOS environment's client ID (`client_…`). */
  clientId: string;
  /**
   * Where to read the JWKS. Default `https://api.workos.com/sso/jwks/<clientId>` (AuthKit
   * sessions). For tokens AuthKit issues as an OAuth server (MCP, Connect), its domain's
   * `/oauth2/jwks`.
   */
  jwksUrl?: string;
  /**
   * The `iss` every token must carry. Default `https://api.workos.com/user_management/<clientId>`
   * (AuthKit sessions). For OAuth-server tokens, the AuthKit domain.
   */
  issuer?: string | string[];
  /**
   * The `aud` every token must carry. AuthKit session tokens have none, so the default checks
   * none; set it for OAuth-server tokens (the Resource Indicator, e.g. `https://app.example.com/mcp`).
   */
  audience?: string | string[];
  /**
   * Whether a token's `client_id` claim, when present, must equal `clientId`. Default true for
   * session tokens; turn it off for OAuth-server tokens, whose `client_id` is the OAuth client's.
   */
  requireClientId?: boolean;
  /** Accepted signing algorithms. Default `['RS256']` (what WorkOS signs with); never an HMAC algorithm. */
  algorithms?: AsymmetricAlgorithm[];
  /** WorkOS's API host, for the default JWKS URL and issuer. Default `api.workos.com`. */
  apiHostname?: string;
  /** How long a fetched JWKS is trusted before it's fetched again, in ms. Default 10 minutes. */
  jwksCacheMaxAgeMs?: number;
  /** The least time between two JWKS fetches caused by an unknown `kid`, in ms. Default 30 000. */
  jwksCooldownMs?: number;
  /** Clock skew allowed on `exp`/`nbf`/`iat`, in seconds. Default 5. */
  clockToleranceSeconds?: number;
}

/** WorkOS access-token claims (the ones this package reads; the rest stay in `claims`). */
export interface WorkOSJwtPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  sid?: string;
  jti?: string;
  client_id?: string;
  org_id?: string;
  role?: string;
  roles?: unknown;
  permissions?: unknown;
  scope?: string;
  entitlements?: unknown;
  feature_flags?: unknown;
  /** Present while a WorkOS team member impersonates the user, or on a claimed agent's token. */
  act?: Record<string, unknown>;
  [claim: string]: unknown;
}

export interface WorkOSIdentityClientConfig {
  /** The environment's API key (`sk_…`). Server-side only. */
  apiKey: string;
  clientId: string;
  /** WorkOS's API host. Default `api.workos.com`. */
  apiHostname?: string;
  /**
   * The provider names WorkOS uses for Google and GitHub. Defaults `GoogleOAuth` and `GitHubOAuth`.
   */
  providerNames?: Partial<Record<'google' | 'github', string>>;
  /**
   * Who sends the codes and links: `app` (the default: WorkOS's own emails are off in the
   * Dashboard, and the app emails what these calls return) or `provider` (WorkOS sends them).
   */
  emailsSentBy?: 'app' | 'provider';
}
