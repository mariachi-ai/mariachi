import type { OAuthConfig, OAuthTokens } from '../types';

export class OAuthAdapter {
  constructor(private readonly config: OAuthConfig) {}

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

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: 'authorization_code',
        code,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OAuth token exchange failed: ${response.status} ${body}`);
    }

    const data = await response.json() as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string | undefined,
      expiresAt: new Date(Date.now() + (data.expires_in as number) * 1000),
      tokenType: (data.token_type as string) ?? 'Bearer',
    };
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error(`OAuth token refresh failed: ${response.status}`);
    }

    const data = await response.json() as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      refreshToken: (data.refresh_token as string | undefined) ?? refreshToken,
      expiresAt: new Date(Date.now() + (data.expires_in as number) * 1000),
      tokenType: (data.token_type as string) ?? 'Bearer',
    };
  }
}
