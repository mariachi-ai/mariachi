import { ConfigError } from '@mariachi/core';
import type { AuthConfig, AuthenticationAdapter, RBACConfig } from './types';
import { JWTAdapter } from './adapters/jwt';
import { ApiKeyAdapter } from './adapters/api-key';
import { RBACAdapter } from './authorization/rbac';

export type {
  AuthConfig,
  IdentityType,
  IdentityPayload,
  ResolvedIdentity,
  AuthenticationAdapter,
  AuthorizationAdapter,
  Permission,
  RoleDefinition,
  RoleStore,
  PermissionSource,
  RBACConfig,
  OAuthConfig,
  OAuthTokens,
  OAuthAuthorizationRequest,
  SessionInfo,
} from './types';

export type { AuthProvider, AuthProviderWebhookConfig } from './provider';

export type { AuthWebhookHandler, AuthWebhookEvent, AuthEventType } from './webhooks/types';
export { AUTH_EVENT_TYPES } from './webhooks/types';

export { createAuthWebhookDispatcher } from './webhooks/dispatcher';
export type { AuthWebhookDispatcherConfig, AuthWebhookDispatchResult } from './webhooks/dispatcher';

export { JWTAdapter, type JWTAdapterOptions } from './adapters/jwt';
export { OAuthAdapter } from './adapters/oauth';
export { ApiKeyAdapter, hashApiKey, createApiKey, generateApiKey, type GeneratedApiKey } from './adapters/api-key';
export {
  SessionManager,
  InMemorySessionStore,
  hashSessionToken,
  type SessionStore,
  type SessionRecord,
  type SessionManagerOptions,
} from './sessions';
export { RBACAdapter, InMemoryRoleStore } from './authorization/rbac';
export { CachedRoleStore, type RoleCache } from './authorization/cache';
export { ApiKeyService, MemoryApiKeyStore, type ApiKeyRecord, type ApiKeyStore } from './api-keys';
export { createAuthMiddleware } from './middleware';
export type { AuthMiddlewareOptions } from './middleware';
export { Auth, DefaultAuth } from './auth';
export { BruteForceProtector, DEFAULT_BRUTE_FORCE_CONFIG } from './brute-force';
export type { BruteForceConfig } from './brute-force';
export * from './schema/index';

export function createAuth(config: AuthConfig): AuthenticationAdapter {
  if (config.adapter === 'jwt') {
    const secret = config.jwtSecret ?? config.sessionSecret;
    if (!secret && !config.jwtPublicKey) {
      throw new ConfigError('auth/jwt-config', 'JWT adapter requires jwtSecret or jwtPublicKey');
    }
    return new JWTAdapter({
      secret,
      publicKey: config.jwtPublicKey,
      privateKey: config.jwtPrivateKey,
      algorithms: config.jwtAlgorithms,
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
      expiresIn: config.jwtExpiresIn,
    });
  }
  if (config.adapter === 'api-key') {
    if (!config.apiKeyLookup) throw new ConfigError('auth/api-key-config', 'API key adapter requires apiKeyLookup');
    return new ApiKeyAdapter(config.apiKeyLookup);
  }
  throw new ConfigError('auth/unknown-adapter', `Unknown auth adapter: ${config.adapter}`);
}

export function createAuthorization(config: RBACConfig): RBACAdapter {
  return new RBACAdapter(config);
}
