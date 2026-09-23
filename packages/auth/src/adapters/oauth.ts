import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AuthError } from '@mariachi/core';
import type { OAuthAuthorizationRequest, OAuthConfig, OAuthTokens } from '../types';

const tokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  id_token: z.string().optional(),
  expires_in: z.coerce.number().optional(),
  token_type: z.string().optional(),
  scope: z.string().optional(),
});

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export class OAuthAdapter {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly config: OAuthConfig) {
    this.fetchFn = config.fetch ?? fetch;
  }

  /** Builds the authorization URL with a random `state` and (by default) a PKCE S256 challenge. */
  createAuthorizationRequest(): OAuthAuthorizationRequest {
    const state = randomBytes(24).toString('base64url');
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scopes.join(' '),
      state,
      ...this.config.extraAuthParams,
    });
    let codeVerifier: string | undefined;
    if (this.config.pkce !== false) {
      codeVerifier = randomBytes(32).toString('base64url');
      params.set('code_challenge', createHash('sha256').update(codeVerifier).digest('base64url'));
      params.set('code_challenge_method', 'S256');
    }
    return { url: `${this.config.authorizationUrl}?${params.toString()}`, state, codeVerifier };
  }

  /** @deprecated use createAuthorizationRequest(), which generates state and PKCE for you */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scopes.join(' '),
      state,
    });
    return `${this.config.authorizationUrl}?${params.toString()}`;
  }

  /**
   * Exchanges the callback `code`. `returnedState` must match the state stored from
   * `createAuthorizationRequest()`; mismatches throw `auth/oauth-state-mismatch`.
   */
  async exchangeCode(
    code: string,
    verification: { returnedState: string; expectedState: string; codeVerifier?: string },
  ): Promise<OAuthTokens> {
    if (!verification.expectedState || !safeEqual(verification.returnedState, verification.expectedState)) {
      throw new AuthError('auth/oauth-state-mismatch', 'OAuth state mismatch');
    }
    if (this.config.pkce !== false && !verification.codeVerifier) {
      throw new AuthError('auth/oauth-pkce-missing', 'PKCE code verifier is required');
    }
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      grant_type: 'authorization_code',
      code,
    });
    if (this.config.clientSecret) body.set('client_secret', this.config.clientSecret);
    if (verification.codeVerifier) body.set('code_verifier', verification.codeVerifier);
    return this.tokenRequest(body, 'auth/oauth-exchange-failed');
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    if (this.config.clientSecret) body.set('client_secret', this.config.clientSecret);
    const tokens = await this.tokenRequest(body, 'auth/oauth-refresh-failed');
    return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
  }

  private async tokenRequest(body: URLSearchParams, code: string): Promise<OAuthTokens> {
    let response: Response;
    try {
      response = await this.fetchFn(this.config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body,
      });
    } catch (cause) {
      throw new AuthError(code, 'OAuth token endpoint unreachable', { cause });
    }
    if (!response.ok) {
      throw new AuthError(code, `OAuth token request failed with ${response.status}`, { status: response.status });
    }
    const parsed = tokenResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new AuthError(code, 'OAuth token response was malformed');
    const data = parsed.data;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
      tokenType: data.token_type ?? 'Bearer',
      scope: data.scope,
    };
  }
}
