import type { Context, Middleware } from '@mariachi/core';

export interface AuthConfig {
  adapter: string;
  jwtSecret?: string;
  sessionSecret?: string;
  apiKeyLookup?: (hashedKey: string) => Promise<ResolvedIdentity | null>;
}

export interface ResolvedIdentity {
  userId: string;
  tenantId: string;
  scopes: string[];
  identityType: 'session' | 'api-key' | 'service' | 'webhook';
  apiKeyId?: string;
  sessionId?: string;
}

export interface AuthenticationAdapter {
  verify(token: string): Promise<ResolvedIdentity>;
  sign(payload: Omit<ResolvedIdentity, 'identityType'>, expiresIn?: string): Promise<string>;
}

export interface AuthorizationAdapter {
  can(identity: ResolvedIdentity, action: string, resource: string): Promise<boolean>;
  grant(userId: string, role: string, tenantId?: string): Promise<void>;
  revoke(userId: string, role: string, tenantId?: string): Promise<void>;
  getRoles(userId: string, tenantId?: string): Promise<string[]>;
}

export interface Permission {
  role: string;
  action: string;
  resource: string;
}

export interface RBACConfig {
  permissions: Permission[];
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  tokenType: string;
}

export interface SessionInfo {
  id: string;
  userId: string;
  tenantId: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
  lastActiveAt: Date;
  createdAt: Date;
}
