import type { Algorithm } from 'jsonwebtoken';

export type IdentityType = 'session' | 'api-key' | 'service' | 'webhook';

export interface AuthConfig {
  adapter: 'jwt' | 'api-key' | (string & {});
  /** HMAC secret (HS256/384/512). Mutually exclusive with `jwtPublicKey`. */
  jwtSecret?: string;
  /** PEM public key for RS/ES/PS algorithms. */
  jwtPublicKey?: string;
  /** PEM private key, required only to sign asymmetric tokens. */
  jwtPrivateKey?: string;
  jwtAlgorithms?: Algorithm[];
  jwtIssuer?: string;
  jwtAudience?: string | string[];
  jwtExpiresIn?: string | number;
  /** @deprecated use jwtSecret */
  sessionSecret?: string;
  apiKeyLookup?: (hashedKey: string) => Promise<ResolvedIdentity | null>;
}

export interface ResolvedIdentity {
  userId: string;
  tenantId: string;
  scopes: string[];
  identityType: IdentityType;
  roles?: string[];
  apiKeyId?: string;
  sessionId?: string;
  /** Raw verified claims, for provider-specific fields. */
  claims?: Record<string, unknown>;
}

export type IdentityPayload = Omit<ResolvedIdentity, 'identityType' | 'claims'>;

export interface AuthenticationAdapter {
  verify(token: string): Promise<ResolvedIdentity>;
  sign(payload: IdentityPayload, expiresIn?: string | number): Promise<string>;
}

export interface AuthorizationAdapter {
  can(identity: ResolvedIdentity, action: string, resource: string): Promise<boolean>;
  grant(userId: string, role: string, tenantId?: string): Promise<void>;
  revoke(userId: string, role: string, tenantId?: string): Promise<void>;
  getRoles(userId: string, tenantId?: string): Promise<string[]>;
}

export interface Permission {
  role: string;
  /** Action name or `*`. */
  action: string;
  /** Resource name or `*`. */
  resource: string;
}

export interface RoleDefinition {
  name: string;
  /** Roles whose permissions this role also gets. */
  inherits?: string[];
}

/** Persists role assignments. Default is in-memory; use a database-backed store in production. */
export interface RoleStore {
  getRoles(userId: string, tenantId: string | undefined): Promise<string[]>;
  grant(userId: string, role: string, tenantId: string | undefined): Promise<void>;
  revoke(userId: string, role: string, tenantId: string | undefined): Promise<void>;
}

/** Loads role permissions from outside the config, e.g. `DrizzleRoleStore` reading `roles.permissions`. */
export interface PermissionSource {
  loadPermissions(): Promise<Permission[]>;
}

export interface RBACConfig {
  /** Permissions fixed in code. Merged with those from `permissionSource`. */
  permissions?: Permission[];
  roles?: RoleDefinition[];
  store?: RoleStore;
  /** Database-backed permissions. Loaded on first check and reloaded after `permissionTtlMs`. */
  permissionSource?: PermissionSource;
  /** How long loaded permissions are reused. Default 30s. */
  permissionTtlMs?: number;
  /** Scope that bypasses all checks. Default none. */
  superuserScope?: string;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** Use PKCE (S256). Default true. */
  pkce?: boolean;
  /** Extra params appended to the authorization URL (e.g. `prompt`, `access_type`). */
  extraAuthParams?: Record<string, string>;
  fetch?: typeof fetch;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: Date;
  tokenType: string;
  scope?: string;
}

export interface OAuthAuthorizationRequest {
  url: string;
  /** Persist server-side or in a signed, httpOnly cookie; compare on callback. */
  state: string;
  /** Persist alongside `state`; required for the code exchange when PKCE is on. */
  codeVerifier?: string;
}

export interface SessionInfo {
  id: string;
  userId: string;
  tenantId: string;
  scopes: string[];
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
  lastActiveAt: Date;
  createdAt: Date;
  revokedAt?: Date | null;
}
