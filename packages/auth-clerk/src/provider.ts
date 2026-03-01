import { createClerkClient, verifyToken, type ClerkClient } from '@clerk/backend';
import { AuthError } from '@mariachi/core';
import type { AuthProvider, AuthProviderWebhookConfig, ResolvedIdentity } from '@mariachi/auth';
import type { AuthWebhookHandler } from '@mariachi/auth';
import type { ClerkConfig } from './types';
import { ClerkWebhookHandler } from './webhooks/handler';

export class ClerkAuthProvider implements AuthProvider {
  readonly name = 'clerk';
  private readonly clerk: ClerkClient;
  private readonly config: ClerkConfig;

  constructor(config: ClerkConfig) {
    this.config = config;
    this.clerk = createClerkClient({
      secretKey: config.secretKey,
      publishableKey: config.publishableKey,
    });
  }

  async verify(token: string): Promise<ResolvedIdentity> {
    try {
      const payload = await verifyToken(token, {
        secretKey: this.config.secretKey,
        authorizedParties: this.config.authorizedParties,
        jwtKey: this.config.jwtKey,
      });

      return {
        userId: payload.sub,
        tenantId: payload.org_id ?? '',
        scopes: payload.org_role ? [payload.org_role] : [],
        identityType: 'session',
        sessionId: payload.sid,
      };
    } catch (error) {
      throw new AuthError(
        'auth/invalid-token',
        `Clerk token verification failed: ${(error as Error).message}`,
      );
    }
  }

  createWebhookHandler(config: AuthProviderWebhookConfig): AuthWebhookHandler {
    return new ClerkWebhookHandler(config.secret);
  }

  /** Access the underlying Clerk SDK client for provider-specific operations */
  get client(): ClerkClient {
    return this.clerk;
  }
}
