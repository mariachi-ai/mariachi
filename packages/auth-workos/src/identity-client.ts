import { decodeJwt } from 'jose';
import { AuthError } from '@mariachi/core';
import type {
  AuthorizationUrlInput,
  CodeExchangeInput,
  CreateIdentityUserInput,
  IdentityClient,
  IdentityPendingReason,
  IdentityRequestContext,
  IdentityUser,
  PasswordSignInInput,
  SignInResult,
  SignOutInput,
  TokenSet,
} from '@mariachi/auth';
import type { WorkOSIdentityClientConfig } from './types';

type WorkOSSdk = typeof import('@workos-inc/node');
type WorkOSClient = InstanceType<WorkOSSdk['WorkOS']>;
type WorkOSUser = Awaited<ReturnType<WorkOSClient['userManagement']['getUser']>>;
type AuthenticationResponse = Awaited<ReturnType<WorkOSClient['userManagement']['authenticateWithPassword']>>;

const DEFAULT_API_HOSTNAME = 'api.workos.com';
const PENDING: Record<string, IdentityPendingReason> = {
  email_verification_required: 'email-verification',
  mfa_challenge: 'mfa',
  mfa_enrollment: 'mfa',
  mfa_verification: 'mfa',
  organization_selection_required: 'organization-selection',
  sso_required: 'sso-required',
  radar_email_challenge: 'risk-challenge',
  radar_sms_challenge: 'risk-challenge',
};

/** What the SDK's exceptions carry (`AuthenticationException`, `BadRequestException`, …). */
interface SdkError {
  name?: string;
  status?: number;
  code?: string;
  message?: string;
  pendingAuthenticationToken?: string;
  rawData?: { user?: Record<string, unknown>; error?: string; code?: string; email?: string; [key: string]: unknown };
}

/** Ids in a pending sign-in's raw data the app needs to finish it, camel-cased. */
const PROVIDER_DATA: Record<string, string> = {
  email_verification_id: 'emailVerificationId',
  authentication_challenge_id: 'authenticationChallengeId',
  radar_challenge_id: 'radarChallengeId',
};

function toUser(u: WorkOSUser): IdentityUser {
  const name = u.name ?? ([u.firstName, u.lastName].filter(Boolean).join(' ') || null);
  return {
    id: u.id,
    email: u.email,
    emailVerified: u.emailVerified === true,
    name,
    avatarUrl: u.profilePictureUrl ?? null,
    externalId: u.externalId ?? null,
  };
}

/** The user in an `AuthenticationException`'s raw (snake_case) data. */
function rawUser(raw: Record<string, unknown> | undefined): IdentityUser | undefined {
  if (!raw || typeof raw.id !== 'string' || typeof raw.email !== 'string') return undefined;
  const s = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string) : null);
  return {
    id: raw.id,
    email: raw.email,
    emailVerified: raw.email_verified === true,
    name: s('name') ?? ([s('first_name'), s('last_name')].filter(Boolean).join(' ') || null),
    avatarUrl: s('profile_picture_url'),
    externalId: s('external_id'),
  };
}

/**
 * `sid` and `exp` from an access token WorkOS just returned to us over TLS. Read, not verified:
 * the token is the API's own reply, and `AuthProvider.verify` checks every token a client sends.
 */
function tokens(res: { accessToken: string; refreshToken: string }): TokenSet {
  let sessionId: string | undefined;
  let expiresAt: number | undefined;
  try {
    const claims = decodeJwt(res.accessToken);
    if (typeof claims.sid === 'string') sessionId = claims.sid;
    if (typeof claims.exp === 'number') expiresAt = claims.exp * 1000;
  } catch {
    // An opaque access token: no session id or expiry to report.
  }
  return { accessToken: res.accessToken, refreshToken: res.refreshToken, sessionId, expiresAt };
}

/**
 * `IdentityClient` on the WorkOS User Management API, for a headless sign-in (the app's own
 * pages). Every call is server-side with the environment's API key. `@workos-inc/node` is an
 * optional peer, loaded on first use.
 */
export class WorkOSIdentityClient implements IdentityClient {
  readonly provider = 'workos';

  private sdk: Promise<WorkOSClient> | null = null;
  private readonly host: string;

  constructor(
    private readonly config: WorkOSIdentityClientConfig,
    /** An SDK client to use instead of loading one (tests). */
    client?: WorkOSClient,
  ) {
    if (!config.apiKey) throw new AuthError('auth/invalid-config', 'WorkOS: `apiKey` is required');
    if (!config.clientId) throw new AuthError('auth/invalid-config', 'WorkOS: `clientId` is required');
    this.host = config.apiHostname ?? DEFAULT_API_HOSTNAME;
    if (client) this.sdk = Promise.resolve(client);
  }

  private client(): Promise<WorkOSClient> {
    this.sdk ??= import('@workos-inc/node').then(
      ({ WorkOS }) =>
        new WorkOS(this.config.apiKey, {
          clientId: this.config.clientId,
          ...(this.config.apiHostname ? { apiHostname: this.config.apiHostname } : {}),
        }),
      () => {
        this.sdk = null;
        throw new AuthError(
          'auth/invalid-config',
          'WorkOSIdentityClient requires the optional peer dependency "@workos-inc/node". Install it with: pnpm add @workos-inc/node',
        );
      },
    );
    return this.sdk;
  }

  /** Turns the SDK's exceptions into a pending sign-in or an `AuthError`. */
  private failure(error: unknown, refused: 'auth/invalid-credentials' | 'auth/invalid-grant'): SignInResult {
    const e = error as SdkError;
    if (e?.name === 'AuthenticationException') {
      const code = e.code ?? e.rawData?.code ?? e.rawData?.error ?? '';
      const reason = PENDING[code];
      if (reason) {
        const providerData: Record<string, string> = {};
        for (const [raw, name] of Object.entries(PROVIDER_DATA)) {
          const value = e.rawData?.[raw];
          if (typeof value === 'string') providerData[name] = value;
        }
        const user = rawUser(e.rawData?.user);
        const email = typeof e.rawData?.email === 'string' ? e.rawData.email : user?.email;
        return {
          status: 'pending',
          reason,
          ...(e.pendingAuthenticationToken ? { pendingToken: e.pendingAuthenticationToken } : {}),
          ...(user ? { user } : {}),
          ...(email ? { email } : {}),
          ...(Object.keys(providerData).length ? { providerData } : {}),
        };
      }
    }
    throw this.error(error, refused);
  }

  private error(error: unknown, refused: 'auth/invalid-credentials' | 'auth/invalid-grant'): AuthError {
    if (error instanceof AuthError) return error;
    const e = error as SdkError;
    const meta = { status: e?.status, code: e?.code };
    if (e?.name === 'RateLimitExceededException' || e?.status === 429) {
      return new AuthError('auth/rate-limited', 'WorkOS rate limit reached', meta);
    }
    if (e?.status && [400, 401, 403, 422].includes(e.status)) {
      return new AuthError(refused, `WorkOS refused the request: ${e.message ?? e.code ?? e.status}`, meta);
    }
    return new AuthError('auth/identity-provider', `WorkOS request failed: ${e?.message ?? String(error)}`, meta);
  }

  async signInWithPassword(input: PasswordSignInInput): Promise<SignInResult> {
    const w = await this.client();
    let res: AuthenticationResponse;
    try {
      res = await w.userManagement.authenticateWithPassword({
        clientId: this.config.clientId,
        email: input.email,
        password: input.password,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
    } catch (error) {
      return this.failure(error, 'auth/invalid-credentials');
    }
    return { status: 'signed-in', user: toUser(res.user), tokens: tokens(res) };
  }

  authorizationUrl(input: AuthorizationUrlInput): string {
    const names = { google: 'GoogleOAuth', github: 'GitHubOAuth', ...this.config.providerNames };
    const url = new URL(`https://${this.host}/user_management/authorize`);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('provider', names[input.provider]);
    url.searchParams.set('state', input.state);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (input.loginHint) url.searchParams.set('login_hint', input.loginHint);
    return url.toString();
  }

  async exchangeCode(input: CodeExchangeInput): Promise<SignInResult> {
    const w = await this.client();
    let res: AuthenticationResponse;
    try {
      res = await w.userManagement.authenticateWithCodeAndVerifier({
        clientId: this.config.clientId,
        code: input.code,
        codeVerifier: input.codeVerifier,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
    } catch (error) {
      return this.failure(error, 'auth/invalid-grant');
    }
    return { status: 'signed-in', user: toUser(res.user), tokens: tokens(res) };
  }

  async refresh(refreshToken: string, context: IdentityRequestContext = {}): Promise<TokenSet> {
    const w = await this.client();
    try {
      const res = await w.userManagement.authenticateWithRefreshToken({
        clientId: this.config.clientId,
        refreshToken,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      return tokens(res);
    } catch (error) {
      throw this.error(error, 'auth/invalid-grant');
    }
  }

  async signOut(input: SignOutInput): Promise<void> {
    const { sessionId } = input;
    if (!sessionId) return; // WorkOS revokes sessions by id; a refresh token alone names none.
    const w = await this.client();
    try {
      await w.userManagement.revokeSession({ sessionId });
    } catch (error) {
      if ((error as SdkError)?.status === 404) return; // Already gone.
      throw this.error(error, 'auth/invalid-grant');
    }
  }

  async getUser(id: string): Promise<IdentityUser | null> {
    const w = await this.client();
    try {
      return toUser(await w.userManagement.getUser(id));
    } catch (error) {
      if ((error as SdkError)?.status === 404) return null;
      throw this.error(error, 'auth/invalid-grant');
    }
  }

  async findUserByEmail(email: string): Promise<IdentityUser | null> {
    const w = await this.client();
    try {
      const page = await w.userManagement.listUsers({ email, limit: 1 });
      const match = page.data.find((u) => u.email.toLowerCase() === email.toLowerCase());
      return match ? toUser(match) : null;
    } catch (error) {
      throw this.error(error, 'auth/invalid-grant');
    }
  }

  async createUser(input: CreateIdentityUserInput): Promise<IdentityUser> {
    const w = await this.client();
    try {
      const created = await w.userManagement.createUser({
        email: input.email,
        emailVerified: input.emailVerified,
        password: input.password,
        name: input.name,
        externalId: input.externalId,
      });
      return toUser(created);
    } catch (error) {
      throw this.error(error, 'auth/invalid-grant');
    }
  }

  async deleteUser(id: string): Promise<void> {
    const w = await this.client();
    try {
      await w.userManagement.deleteUser(id);
    } catch (error) {
      if ((error as SdkError)?.status === 404) return;
      throw this.error(error, 'auth/invalid-grant');
    }
  }

  async sendPasswordReset(email: string): Promise<void> {
    const w = await this.client();
    try {
      await w.userManagement.createPasswordReset({ email });
    } catch (error) {
      if ((error as SdkError)?.status === 404) return; // No account: say nothing, as for one that exists.
      throw this.error(error, 'auth/invalid-grant');
    }
  }
}
