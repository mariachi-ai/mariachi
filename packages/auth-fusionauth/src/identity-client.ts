import { randomBytes } from 'node:crypto';
import { decodeJwt } from 'jose';
import { AuthError } from '@mariachi/core';
import type {
  AuthorizationUrlInput,
  CodeExchangeInput,
  CreateIdentityUserInput,
  EmailCodeInput,
  EmailDelivery,
  IdentityClient,
  IdentityRequestContext,
  IdentityUser,
  PasswordSignInInput,
  SignInResult,
  SignOutInput,
  TokenSet,
} from '@mariachi/auth';

export interface FusionAuthIdentityClientConfig {
  /** FusionAuth's base URL (e.g. `https://auth.example.com`). */
  serverUrl: string;
  /** An API key with the user, login, registration and JWT APIs. Server-side only. */
  apiKey: string;
  /** The application: its id (for logins and registrations) and OAuth client. */
  applicationId: string;
  clientId: string;
  clientSecret: string;
  /** The tenant to create users in, when the API key isn't scoped to one. */
  tenantId?: string;
  /** Identity provider ids for `idp_hint`, so social sign-in skips FusionAuth's own page. */
  identityProviderIds?: Partial<Record<'google' | 'github', string>>;
  /** OAuth scopes. Default `openid email profile offline_access`. */
  scope?: string;
  /** `fetch`, for tests. */
  fetch?: typeof fetch;
}

/** A FusionAuth user as its APIs return it (the fields this client reads). */
export interface FusionAuthUser {
  id: string;
  email?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
  verified?: boolean;
  data?: Record<string, unknown>;
  identities?: Array<{ type?: string; value?: string; verified?: boolean; verifiedReason?: string }>;
}

/**
 * Whether FusionAuth vouches for a user's email: its email identity is verified (`Completed`, or by
 * an identity provider), or verification was **skipped by whoever created the user through the
 * admin API** (`verifiedReason: "Skipped"`; only an API-key holder can do that). Never a
 * self-registered address: FusionAuth ≥ 1.59 gives it `verified: false` (`Disabled` or `Pending`)
 * while the legacy `user.verified` says true for everyone when email verification is off. Without
 * identities (an older FusionAuth), the legacy flag.
 */
export function fusionAuthEmailVouched(user: FusionAuthUser): boolean {
  const identities = user.identities;
  if (!Array.isArray(identities)) return user.verified === true;
  const identity = identities.find((i) => i.type === 'email' && i.value?.toLowerCase() === user.email?.toLowerCase());
  return identity?.verified === true || identity?.verifiedReason === 'Skipped';
}

function toUser(u: FusionAuthUser): IdentityUser {
  const name = u.fullName || [u.firstName, u.lastName].filter(Boolean).join(' ') || null;
  const externalId = typeof u.data?.externalId === 'string' ? u.data.externalId : null;
  return { id: u.id, email: u.email ?? '', emailVerified: fusionAuthEmailVouched(u), name, avatarUrl: u.imageUrl ?? null, externalId };
}

/** The session (`sid`, FusionAuth's refresh token id) and expiry from an access token FusionAuth just returned. */
function session(accessToken: string): Pick<TokenSet, 'sessionId' | 'expiresAt'> {
  try {
    const claims = decodeJwt(accessToken);
    return {
      sessionId: typeof claims.sid === 'string' ? claims.sid : undefined,
      expiresAt: typeof claims.exp === 'number' ? claims.exp * 1000 : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * `IdentityClient` on FusionAuth's APIs: the Login API for password sign-in, OAuth for social
 * sign-in and refresh, and the User API for lookups. Matches what an app did by hand against
 * FusionAuth, so it can move onto `IdentityClient` before switching providers.
 */
export class FusionAuthIdentityClient implements IdentityClient {
  readonly provider = 'fusionauth';

  private readonly base: string;
  private readonly http: typeof fetch;

  constructor(private readonly config: FusionAuthIdentityClientConfig) {
    for (const k of ['serverUrl', 'apiKey', 'applicationId', 'clientId', 'clientSecret'] as const) {
      if (!config[k]) throw new AuthError('auth/invalid-config', `FusionAuth: \`${k}\` is required`);
    }
    this.base = config.serverUrl.replace(/\/+$/, '');
    this.http = config.fetch ?? fetch;
  }

  private async call(
    method: string,
    path: string,
    opts: { json?: unknown; form?: Record<string, string>; ip?: string } = {},
  ): Promise<{ status: number; body: Record<string, any> }> {
    const headers: Record<string, string> = {};
    let body: string | undefined;
    if (opts.form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(opts.form).toString();
    } else {
      headers.Authorization = this.config.apiKey;
      if (this.config.tenantId) headers['X-FusionAuth-TenantId'] = this.config.tenantId;
      if (opts.json !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(opts.json);
      }
    }
    if (opts.ip) headers['X-Forwarded-For'] = opts.ip;
    let res: Response;
    try {
      res = await this.http(`${this.base}${path}`, { method, headers, body });
    } catch (error) {
      throw new AuthError('auth/identity-provider', `FusionAuth request failed: ${(error as Error).message}`);
    }
    const text = await res.text();
    let parsed: Record<string, any> = {};
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { text };
      }
    }
    return { status: res.status, body: parsed };
  }

  private fail(status: number, what: string, refused: 'auth/invalid-credentials' | 'auth/invalid-grant'): AuthError {
    if (status === 429) return new AuthError('auth/rate-limited', 'FusionAuth rate limit reached', { status });
    if (status >= 400 && status < 500) return new AuthError(refused, `FusionAuth refused ${what} (${status})`, { status });
    return new AuthError('auth/identity-provider', `FusionAuth ${what} failed (${status})`, { status });
  }

  async signInWithPassword(input: PasswordSignInInput): Promise<SignInResult> {
    const { status, body } = await this.call('POST', '/api/login', {
      json: { loginId: input.email, password: input.password, applicationId: this.config.applicationId, ipAddress: input.ipAddress },
      ip: input.ipAddress,
    });
    return this.loginResult(status, body, input.email, 'the login');
  }

  /** The Login API's answer (password or passwordless) as a SignInResult. */
  private loginResult(status: number, body: Record<string, any>, email: string, what: string): SignInResult {
    // 200: signed in; 202: signed in but not registered for the application (no app roles).
    if ((status === 200 || status === 202) && typeof body.token === 'string' && body.user) {
      return {
        status: 'signed-in',
        user: toUser(body.user),
        tokens: { accessToken: body.token, refreshToken: body.refreshToken ?? '', ...session(body.token) },
      };
    }
    if (status === 212 || status === 213) {
      return { status: 'pending', reason: 'email-verification', email: body.user?.email ?? email, ...(body.user ? { user: toUser(body.user) } : {}) };
    }
    if (status === 242) return { status: 'pending', reason: 'mfa', pendingToken: body.twoFactorId };
    // 404: no such user or a wrong password; 409: locked; 410: expired; 423: breached password.
    if ([404, 409, 410, 423].includes(status)) {
      throw new AuthError('auth/invalid-credentials', 'Invalid email or password', { status });
    }
    throw this.fail(status, what, 'auth/invalid-credentials');
  }

  authorizationUrl(input: AuthorizationUrlInput): string {
    const url = new URL('/oauth2/authorize', this.base);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('scope', this.config.scope ?? 'openid email profile offline_access');
    url.searchParams.set('state', input.state);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    const idp = this.config.identityProviderIds?.[input.provider];
    if (idp) url.searchParams.set('idp_hint', idp);
    if (input.loginHint) url.searchParams.set('login_hint', input.loginHint);
    return url.toString();
  }

  private async token(form: Record<string, string>, what: string, ip?: string): Promise<Record<string, any>> {
    const { status, body } = await this.call('POST', '/oauth2/token', {
      form: { client_id: this.config.clientId, client_secret: this.config.clientSecret, ...form },
      ip,
    });
    if (status !== 200 || typeof body.access_token !== 'string') throw this.fail(status, what, 'auth/invalid-grant');
    return body;
  }

  async exchangeCode(input: CodeExchangeInput): Promise<SignInResult> {
    const body = await this.token(
      { grant_type: 'authorization_code', code: input.code, code_verifier: input.codeVerifier, redirect_uri: input.redirectUri },
      'the code exchange',
      input.ipAddress,
    );
    const userId = typeof body.userId === 'string' ? body.userId : (decodeJwt(body.access_token).sub as string);
    const user = await this.getUser(userId);
    if (!user) throw new AuthError('auth/identity-provider', 'FusionAuth returned tokens for a user it then could not find');
    return {
      status: 'signed-in',
      user,
      tokens: { accessToken: body.access_token, refreshToken: body.refresh_token ?? '', ...session(body.access_token) },
    };
  }

  async refresh(refreshToken: string, context: IdentityRequestContext = {}): Promise<TokenSet> {
    const body = await this.token({ grant_type: 'refresh_token', refresh_token: refreshToken }, 'the refresh', context.ipAddress);
    return { accessToken: body.access_token, refreshToken: body.refresh_token ?? refreshToken, ...session(body.access_token) };
  }

  async signOut(input: SignOutInput): Promise<void> {
    const path = input.refreshToken
      ? `/api/jwt/refresh?token=${encodeURIComponent(input.refreshToken)}`
      : input.sessionId
        ? `/api/jwt/refresh/${encodeURIComponent(input.sessionId)}`
        : null;
    if (!path) return;
    const { status } = await this.call('DELETE', path);
    // 404: already revoked or expired; signed out all the same.
    if (status !== 200 && status !== 404) throw this.fail(status, 'the refresh token revoke', 'auth/invalid-grant');
  }

  async getUser(id: string): Promise<IdentityUser | null> {
    const { status, body } = await this.call('GET', `/api/user/${encodeURIComponent(id)}`);
    if (status === 404) return null;
    if (status !== 200 || !body.user) throw this.fail(status, 'the user lookup', 'auth/invalid-grant');
    return toUser(body.user);
  }

  async findUserByEmail(email: string): Promise<IdentityUser | null> {
    const { status, body } = await this.call('GET', `/api/user?email=${encodeURIComponent(email)}`);
    if (status === 404) return null;
    if (status !== 200 || !body.user) throw this.fail(status, 'the user lookup', 'auth/invalid-grant');
    return toUser(body.user);
  }

  async createUser(input: CreateIdentityUserInput): Promise<IdentityUser> {
    const { status, body } = await this.call('POST', '/api/user/registration', {
      json: {
        user: {
          email: input.email,
          // FusionAuth requires a password; a user without one signs in through a provider or a reset.
          password: input.password ?? randomBytes(32).toString('base64url'),
          ...(input.name ? { fullName: input.name } : {}),
          ...(input.externalId ? { data: { externalId: input.externalId } } : {}),
        },
        registration: { applicationId: this.config.applicationId },
        skipVerification: input.emailVerified,
        sendSetPasswordEmail: false,
      },
    });
    if (status !== 200 || !body.user) throw this.fail(status, 'the user creation', 'auth/invalid-grant');
    return toUser(body.user);
  }

  async deleteUser(id: string): Promise<void> {
    const { status } = await this.call('DELETE', `/api/user/${encodeURIComponent(id)}?hardDelete=true`);
    if (status !== 200 && status !== 404) throw this.fail(status, 'the user deletion', 'auth/invalid-grant');
  }

  /** FusionAuth sends the reset email (its tenant's template) and resets on its own page. */
  async sendPasswordReset(email: string): Promise<EmailDelivery<{ token: string; url?: string; expiresAt?: number }>> {
    const { status } = await this.call('POST', '/api/user/forgot-password', {
      json: { loginId: email, applicationId: this.config.applicationId, sendForgotPasswordEmail: true },
    });
    if (status === 404) return { deliveredBy: 'nobody' }; // answered as for an account
    if (status === 403) {
      throw new AuthError('auth/not-supported', "FusionAuth's tenant has no forgot-password email template", { status });
    }
    if (status !== 200) throw this.fail(status, 'the password reset', 'auth/invalid-grant');
    return { deliveredBy: 'provider' };
  }

  async resetPassword(): Promise<IdentityUser> {
    throw new AuthError('auth/not-supported', "FusionAuth resets passwords on its own page (sendPasswordReset's email links there)");
  }

  async setPassword(userId: string, password: string): Promise<void> {
    const { status } = await this.call('PATCH', `/api/user/${encodeURIComponent(userId)}`, { json: { user: { password } } });
    if (status !== 200) throw this.fail(status, 'the password change', 'auth/invalid-grant');
  }

  /** FusionAuth's passwordless API: the app sends the code. */
  async startEmailCode(email: string): Promise<EmailDelivery<{ code: string; expiresAt?: number }>> {
    const { status, body } = await this.call('POST', '/api/passwordless/start', { json: { loginId: email, applicationId: this.config.applicationId } });
    if (status === 404) return { deliveredBy: 'nobody' };
    if (status !== 200 || typeof body.code !== 'string') throw this.fail(status, 'the passwordless start', 'auth/invalid-grant');
    return { deliveredBy: 'app', code: body.code };
  }

  async signInWithEmailCode(input: EmailCodeInput): Promise<SignInResult> {
    const { status, body } = await this.call('POST', '/api/passwordless/login', { json: { code: input.code, ipAddress: input.ipAddress }, ip: input.ipAddress });
    if (status === 404) throw new AuthError('auth/invalid-grant', 'The code is wrong or expired', { status });
    return this.loginResult(status, body, input.email, 'the passwordless login');
  }

  async pendingVerificationCode(): Promise<string> {
    throw new AuthError('auth/not-supported', 'FusionAuth sends its own verification emails');
  }

  async verifyEmailAndSignIn(): Promise<SignInResult> {
    throw new AuthError('auth/not-supported', 'FusionAuth verifies emails through its own link');
  }
}
