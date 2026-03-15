import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AuthError } from '@mariachi/core';
import type {
  AuthProvider,
  AuthProviderWebhookConfig,
  ResolvedIdentity,
} from '@mariachi/auth';
import type { FusionAuthConfig } from './types';
import { FusionAuthWebhookHandler } from './webhooks/handler';

/** FusionAuth access token payload claims (subset we use) */
interface FusionAuthJwtPayload {
  sub: string;
  applicationId?: string;
  roles?: string[];
  aud?: string | string[];
  iss?: string;
  sid?: string;
}

export class FusionAuthAuthProvider implements AuthProvider {
  readonly name = 'fusionauth';

  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly config: FusionAuthConfig;

  constructor(config: FusionAuthConfig) {
    this.config = config;
    const baseUrl = config.serverUrl.replace(/\/$/, '');
    const jwksUrl = new URL('/.well-known/jwks.json', baseUrl);
    this.jwks = createRemoteJWKSet(jwksUrl);
  }

  async verify(token: string): Promise<ResolvedIdentity> {
    try {
      const verifyOpts: { audience?: string; issuer?: string } = {};
      if (this.config.clientId) verifyOpts.audience = this.config.clientId;
      if (this.config.issuer) verifyOpts.issuer = this.config.issuer;
      const { payload } = await jwtVerify(token, this.jwks, verifyOpts);

      const claims = payload as unknown as FusionAuthJwtPayload;
      const roles = Array.isArray(claims.roles) ? claims.roles : [];

      return {
        userId: claims.sub,
        tenantId: claims.applicationId ?? '',
        scopes: roles,
        identityType: 'session',
        sessionId: claims.sid,
      };
    } catch (error) {
      throw new AuthError(
        'auth/invalid-token',
        `FusionAuth token verification failed: ${(error as Error).message}`,
      );
    }
  }

  createWebhookHandler(config: AuthProviderWebhookConfig): FusionAuthWebhookHandler {
    return new FusionAuthWebhookHandler({
      serverUrl: this.config.serverUrl,
      secret: config.secret,
    });
  }
}
