import type { ResolvedIdentity } from './types';
import type { AuthWebhookHandler } from './webhooks/types';

/**
 * High-level abstraction for third-party auth providers (Clerk, Auth0, Firebase, etc.).
 *
 * Each provider implements session token verification and webhook event handling.
 * Webhook events are normalized into standard `AuthWebhookEvent` types so the
 * application code is decoupled from any specific provider.
 */
export interface AuthProvider {
  /** Unique identifier for this provider (e.g. 'clerk', 'auth0', 'firebase') */
  readonly name: string;

  /** Verify a session token issued by this provider and resolve the user's identity */
  verify(token: string): Promise<ResolvedIdentity>;

  /** Create a webhook handler that can verify and normalize incoming provider events */
  createWebhookHandler(config: AuthProviderWebhookConfig): AuthWebhookHandler;
}

export interface AuthProviderWebhookConfig {
  /** Provider-specific webhook signing/verification secret */
  secret: string;
}
