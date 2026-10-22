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
  /** Starts a password reset. The email goes out the provider's way (its own, or an event the app sends from). */
  sendPasswordReset(email: string): Promise<void>;
}
