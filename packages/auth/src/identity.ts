/**
 * The calls an app makes to its identity provider beyond checking tokens: sign-in done by the
 * app's own backend (headless), the social sign-in redirect and code exchange, refresh, sign-out,
 * and user lookups. `AuthProvider` verifies what the provider issues; `IdentityClient` asks the
 * provider for it. Implemented by provider packages (`@mariachi/auth-workos`,
 * `@mariachi/auth-fusionauth`), so an app can switch providers by configuration.
 *
 * Errors are `AuthError`s with these codes:
 * - `auth/invalid-credentials`: wrong email or password;
 * - `auth/invalid-grant`: an authorization code, verifier or refresh token the provider refused;
 * - `auth/rate-limited`: the provider's rate limit;
 * - `auth/identity-provider`: anything else from the provider (unreachable, 5xx, unexpected reply).
 */

/** Social sign-in providers every implementation maps to its own names. */
export type IdentityOAuthProvider = 'google' | 'github';

export interface IdentityUser {
  /** The provider's id for the user (a token's `sub`). */
  id: string;
  email: string;
  /**
   * Whether the person has proven they control `email`, as the provider decides it. Never a
   * default or legacy flag that is true for everyone: account linking and invitations rely on it.
   */
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
  /** The app's own id for the user, when the provider stores one. */
  externalId: string | null;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** The provider's session id (the access token's `sid`), when it has sessions. */
  sessionId?: string;
  /** When the access token expires, in ms since the epoch, when known. */
  expiresAt?: number;
}

/** Why a sign-in stopped short of tokens. The app finishes it with the provider's own call. */
export type IdentityPendingReason =
  | 'email-verification'
  | 'mfa'
  | 'organization-selection'
  /** The email's domain signs in through an enterprise connection; start that instead. */
  | 'sso-required'
  /** The provider's abuse protection wants an extra challenge (e.g. an emailed code). */
  | 'risk-challenge';

export type SignInResult =
  | { status: 'signed-in'; user: IdentityUser; tokens: TokenSet }
  | {
      status: 'pending';
      reason: IdentityPendingReason;
      /** What the provider wants back to finish the sign-in. */
      pendingToken?: string;
      user?: IdentityUser;
      email?: string;
      /** Provider-specific ids for finishing it (e.g. WorkOS's `emailVerificationId`). */
      providerData?: Record<string, string>;
    };

/** Who is signing in, passed on to the provider's abuse checks. */
export interface IdentityRequestContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface PasswordSignInInput extends IdentityRequestContext {
  email: string;
  password: string;
}

export interface AuthorizationUrlInput {
  provider: IdentityOAuthProvider;
  redirectUri: string;
  state: string;
  /** PKCE S256 challenge for the verifier the app keeps. */
  codeChallenge: string;
  loginHint?: string;
}

export interface CodeExchangeInput extends IdentityRequestContext {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export interface SignOutInput {
  sessionId?: string;
  refreshToken?: string;
}

/**
 * Who sends an email the provider asks for: the provider itself, the app (with the code or token
 * to put in it: providers whose own emails are off), or nobody (no such account; answer the same
 * way as for one, so the reply never reveals which addresses exist).
 */
export type EmailDelivery<T> = { deliveredBy: 'provider' } | { deliveredBy: 'nobody' } | ({ deliveredBy: 'app' } & T);

export interface EmailCodeInput extends IdentityRequestContext {
  email: string;
  code: string;
}

export interface VerifyEmailInput extends IdentityRequestContext {
  /** `pendingToken` from a sign-in held at `email-verification`. */
  pendingToken: string;
  code: string;
}

export interface CreateIdentityUserInput {
  email: string;
  /** Only when the app itself has proven the address (e.g. an invitation link it emailed). */
  emailVerified: boolean;
  password?: string;
  name?: string;
  externalId?: string;
}

export interface IdentityClient {
  /** The provider's name, as `AuthProvider.name`. */
  readonly provider: string;
  signInWithPassword(input: PasswordSignInInput): Promise<SignInResult>;
  /** Where to send the browser for social sign-in. */
  authorizationUrl(input: AuthorizationUrlInput): string;
  exchangeCode(input: CodeExchangeInput): Promise<SignInResult>;
  refresh(refreshToken: string, context?: IdentityRequestContext): Promise<TokenSet>;
  /** Ends the session at the provider. Without a session id or refresh token, does nothing. */
  signOut(input: SignOutInput): Promise<void>;
  getUser(id: string): Promise<IdentityUser | null>;
  findUserByEmail(email: string): Promise<IdentityUser | null>;
  createUser(input: CreateIdentityUserInput): Promise<IdentityUser>;
  deleteUser(id: string): Promise<void>;
  /** Starts a password reset: the provider emails it, or the app does with the returned token (and link). */
  sendPasswordReset(email: string): Promise<EmailDelivery<{ token: string; url?: string; expiresAt?: number }>>;
  /** Sets a new password with a reset token; the user it belongs to. */
  resetPassword(input: { token: string; password: string }): Promise<IdentityUser>;
  /** Sets a user's password (an admin action: the app has already decided who may). */
  setPassword(userId: string, password: string): Promise<void>;
  /**
   * A one-time code that proves the inbox (sign-up, passwordless sign-in). The provider may create
   * a passwordless, unverified user for a new address.
   */
  startEmailCode(email: string, context?: IdentityRequestContext): Promise<EmailDelivery<{ code: string; expiresAt?: number }>>;
  /** Signs in with that code; the user's email is verified by it. */
  signInWithEmailCode(input: EmailCodeInput): Promise<SignInResult>;
  /** The code to email for a sign-in held at `email-verification`, when the app sends emails. */
  pendingVerificationCode(pending: Extract<SignInResult, { status: 'pending' }>): Promise<string>;
  /** Finishes a sign-in held at `email-verification` with the code from that email. */
  verifyEmailAndSignIn(input: VerifyEmailInput): Promise<SignInResult>;
}
