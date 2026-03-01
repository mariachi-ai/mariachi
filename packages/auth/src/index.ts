export type {
  AuthConfig,
  ResolvedIdentity,
  AuthenticationAdapter,
  AuthorizationAdapter,
  Permission,
  RBACConfig,
  OAuthConfig,
  OAuthTokens,
  SessionInfo,
} from './types';

export type { AuthProvider, AuthProviderWebhookConfig } from './provider';

export type {
  AuthWebhookHandler,
  AuthWebhookEvent,
  AuthEventType,
} from './webhooks/types';
export { AUTH_EVENT_TYPES } from './webhooks/types';

export { createAuthWebhookDispatcher } from './webhooks/dispatcher';
export type {
  AuthWebhookDispatcherConfig,
  AuthWebhookDispatchResult,
} from './webhooks/dispatcher';

export { JWTAdapter } from './adapters/jwt';
export { OAuthAdapter } from './adapters/oauth';
export {
  ApiKeyAdapter,
  hashApiKey,
  generateApiKey,
} from './adapters/api-key';
export { RBACAdapter } from './authorization/rbac';
export { createAuthMiddleware } from './middleware';
export type { AuthMiddlewareOptions } from './middleware';
export { Auth, DefaultAuth } from './auth';
export { BruteForceProtector, DEFAULT_BRUTE_FORCE_CONFIG } from './brute-force';
export type { BruteForceConfig } from './brute-force';
export * from './schema/index';
import type {
  AuthConfig,
  AuthenticationAdapter,
  AuthorizationAdapter,
  RBACConfig,
} from './types';
import { JWTAdapter } from './adapters/jwt';
import { ApiKeyAdapter } from './adapters/api-key';
import { RBACAdapter } from './authorization/rbac';

export function createAuth(config: AuthConfig): AuthenticationAdapter {
  if (config.adapter === 'jwt') {
    const secret = config.jwtSecret ?? config.sessionSecret;
    if (!secret) {
      throw new Error('JWT adapter requires jwtSecret or sessionSecret');
    }
    return new JWTAdapter({ secret });
  }
  if (config.adapter === 'api-key') {
    const lookup = config.apiKeyLookup;
    if (!lookup) {
      throw new Error('API key adapter requires apiKeyLookup');
    }
    return new ApiKeyAdapter(lookup);
  }
  throw new Error(`Unknown auth adapter: ${config.adapter}`);
}

export function createAuthorization(config: RBACConfig): AuthorizationAdapter {
  return new RBACAdapter(config);
}
