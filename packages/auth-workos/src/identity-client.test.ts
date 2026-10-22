import { describe, expect, it, vi } from 'vitest';
import { WorkOSIdentityClient } from './identity-client';
import { createWorkOSIdentityClient } from './index';

const CONFIG = { apiKey: 'sk_test_unit', clientId: 'client_01TEST' };

const user = (over: Record<string, unknown> = {}) => ({
  object: 'user',
  id: 'user_01',
  email: 'ada@example.org',
  emailVerified: true,
  name: null,
  firstName: 'Ada',
  lastName: 'Lovelace',
  profilePictureUrl: 'https://img.example.org/ada.png',
  externalId: 'ensemble-uuid-1',
  metadata: {},
  ...over,
});

/** An unsigned JWT with the claims WorkOS puts in an access token (only decoded by the client). */
const accessToken = (claims: Record<string, unknown> = { sid: 'session_01', exp: 1_792_656_827 }) =>
  `${Buffer.from('{"alg":"RS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;

const sdkError = (name: string, fields: Record<string, unknown>) => Object.assign(new Error(String(fields.message ?? name)), { name, ...fields });

function fakeSdk(overrides: Record<string, (...args: never[]) => unknown> = {}) {
  const userManagement = {
    authenticateWithPassword: vi.fn(async () => ({ user: user(), accessToken: accessToken(), refreshToken: 'rt_1' })),
    authenticateWithCodeAndVerifier: vi.fn(async () => ({ user: user(), accessToken: accessToken(), refreshToken: 'rt_1' })),
    authenticateWithRefreshToken: vi.fn(async () => ({ user: user(), accessToken: accessToken({ sid: 'session_01', exp: 1_792_657_000 }), refreshToken: 'rt_2' })),
    revokeSession: vi.fn(async () => undefined),
    getUser: vi.fn(async () => user()),
    listUsers: vi.fn(async () => ({ data: [user({ email: 'Ada@Example.org' })] })),
    createUser: vi.fn(async (input: Record<string, unknown>) => user({ email: input.email, emailVerified: input.emailVerified })),
    deleteUser: vi.fn(async () => undefined),
    createPasswordReset: vi.fn(async () => ({ id: 'password_reset_01' })),
    ...overrides,
  };
  const client = new WorkOSIdentityClient(CONFIG, { userManagement } as never);
  return { client, userManagement };
}

describe('WorkOSIdentityClient: sign-in', () => {
  it('signs in with a password and reports the session from the access token', async () => {
    const { client, userManagement } = fakeSdk();
    const out = await client.signInWithPassword({ email: 'ada@example.org', password: 'pw', ipAddress: '203.0.113.7', userAgent: 'test' });
    expect(out).toEqual({
      status: 'signed-in',
      user: { id: 'user_01', email: 'ada@example.org', emailVerified: true, name: 'Ada Lovelace', avatarUrl: 'https://img.example.org/ada.png', externalId: 'ensemble-uuid-1' },
      tokens: { accessToken: accessToken(), refreshToken: 'rt_1', sessionId: 'session_01', expiresAt: 1_792_656_827_000 },
    });
    expect(userManagement.authenticateWithPassword).toHaveBeenCalledWith({
      clientId: 'client_01TEST', email: 'ada@example.org', password: 'pw', ipAddress: '203.0.113.7', userAgent: 'test',
    });
  });

  it('turns an unverified email into a pending sign-in, with what the app needs to finish it', async () => {
    // The raw data WorkOS staging returned (2026-10-22), token redacted.
    const { client } = fakeSdk({
      authenticateWithPassword: async () => {
        throw sdkError('AuthenticationException', {
          status: 403,
          code: 'email_verification_required',
          pendingAuthenticationToken: 'pat_1',
          rawData: {
            code: 'email_verification_required',
            message: 'Email ownership must be verified before authentication.',
            email: 'new@example.org',
            pending_authentication_token: 'pat_1',
            email_verification_id: 'email_verification_01',
          },
        });
      },
    });
    expect(await client.signInWithPassword({ email: 'new@example.org', password: 'pw' })).toEqual({
      status: 'pending',
      reason: 'email-verification',
      pendingToken: 'pat_1',
      email: 'new@example.org',
      providerData: { emailVerificationId: 'email_verification_01' },
    });
  });

  it('maps a user in the raw data when WorkOS includes one', async () => {
    const { client } = fakeSdk({
      authenticateWithPassword: async () => {
        throw sdkError('AuthenticationException', {
          status: 403,
          code: 'organization_selection_required',
          pendingAuthenticationToken: 'pat_2',
          rawData: { code: 'organization_selection_required', user: { id: 'user_02', email: 'new@example.org', email_verified: true, first_name: 'New' } },
        });
      },
    });
    expect(await client.signInWithPassword({ email: 'new@example.org', password: 'pw' })).toMatchObject({
      reason: 'organization-selection',
      email: 'new@example.org',
      user: { id: 'user_02', email: 'new@example.org', emailVerified: true, name: 'New', avatarUrl: null, externalId: null },
    });
  });

  it.each([
    ['sso_required', { rawData: { error: 'sso_required' } }, 'sso-required'],
    ['mfa_challenge', { code: 'mfa_challenge', pendingAuthenticationToken: 'pat' }, 'mfa'],
    ['organization_selection_required', { code: 'organization_selection_required' }, 'organization-selection'],
    ['radar_email_challenge', { code: 'radar_email_challenge' }, 'risk-challenge'],
  ])('maps %s to a pending reason', async (_name, fields, reason) => {
    const { client } = fakeSdk({
      authenticateWithPassword: async () => {
        throw sdkError('AuthenticationException', { status: 400, ...fields });
      },
    });
    expect(await client.signInWithPassword({ email: 'a@example.org', password: 'pw' })).toMatchObject({ status: 'pending', reason });
  });

  it.each([
    ['a wrong password', sdkError('BadRequestException', { status: 400, code: 'invalid_credentials' }), 'auth/invalid-credentials'],
    ['the rate limit', sdkError('RateLimitExceededException', { status: 429 }), 'auth/rate-limited'],
    ['a server error', sdkError('GenericServerException', { status: 503 }), 'auth/identity-provider'],
    ['a network failure', new TypeError('fetch failed'), 'auth/identity-provider'],
  ])('throws for %s', async (_name, error, code) => {
    const { client } = fakeSdk({
      authenticateWithPassword: async () => {
        throw error;
      },
    });
    await expect(client.signInWithPassword({ email: 'a@example.org', password: 'pw' })).rejects.toMatchObject({ code });
  });

  it('exchanges a code with its PKCE verifier; a refused code is invalid-grant', async () => {
    const { client, userManagement } = fakeSdk();
    const out = await client.exchangeCode({ code: 'c', codeVerifier: 'v', redirectUri: 'https://app.example.org/api/auth/callback' });
    expect(out.status).toBe('signed-in');
    expect(userManagement.authenticateWithCodeAndVerifier).toHaveBeenCalledWith(expect.objectContaining({ code: 'c', codeVerifier: 'v', clientId: 'client_01TEST' }));

    const refused = fakeSdk({
      authenticateWithCodeAndVerifier: async () => {
        throw sdkError('BadRequestException', { status: 400, code: 'invalid_grant' });
      },
    });
    await expect(refused.client.exchangeCode({ code: 'c', codeVerifier: 'bad', redirectUri: 'x' })).rejects.toMatchObject({ code: 'auth/invalid-grant' });
  });

  it('builds the social sign-in URL with PKCE and the provider names WorkOS uses', () => {
    const { client } = fakeSdk();
    const url = new URL(
      client.authorizationUrl({ provider: 'github', redirectUri: 'https://app.example.org/api/auth/callback', state: 's1', codeChallenge: 'cc', loginHint: 'ada@example.org' }),
    );
    expect(`${url.origin}${url.pathname}`).toBe('https://api.workos.com/user_management/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'client_01TEST',
      redirect_uri: 'https://app.example.org/api/auth/callback',
      response_type: 'code',
      provider: 'GitHubOAuth',
      state: 's1',
      code_challenge: 'cc',
      code_challenge_method: 'S256',
      login_hint: 'ada@example.org',
    });
    expect(new URL(client.authorizationUrl({ provider: 'google', redirectUri: 'r', state: 's', codeChallenge: 'c' })).searchParams.get('provider')).toBe('GoogleOAuth');
  });
});

describe('WorkOSIdentityClient: sessions and users', () => {
  it('refreshes into a new token set; a refused refresh token is invalid-grant', async () => {
    const { client } = fakeSdk();
    expect(await client.refresh('rt_1')).toMatchObject({ refreshToken: 'rt_2', sessionId: 'session_01', expiresAt: 1_792_657_000_000 });
    const refused = fakeSdk({
      authenticateWithRefreshToken: async () => {
        throw sdkError('BadRequestException', { status: 400, code: 'invalid_grant' });
      },
    });
    await expect(refused.client.refresh('rt_old')).rejects.toMatchObject({ code: 'auth/invalid-grant' });
  });

  it('signs out by session id, ignores an unknown session, and does nothing without one', async () => {
    const { client, userManagement } = fakeSdk();
    await client.signOut({ sessionId: 'session_01' });
    expect(userManagement.revokeSession).toHaveBeenCalledWith({ sessionId: 'session_01' });
    await client.signOut({ refreshToken: 'rt_1' });
    expect(userManagement.revokeSession).toHaveBeenCalledTimes(1);

    const gone = fakeSdk({
      revokeSession: async () => {
        throw sdkError('NotFoundException', { status: 404 });
      },
    });
    await expect(gone.client.signOut({ sessionId: 'session_gone' })).resolves.toBeUndefined();
  });

  it('gets users by id (null when missing) and by email (case-insensitive)', async () => {
    const { client } = fakeSdk();
    expect((await client.getUser('user_01'))?.externalId).toBe('ensemble-uuid-1');
    expect((await client.findUserByEmail('ada@example.org'))?.id).toBe('user_01');
    const missing = fakeSdk({
      getUser: async () => {
        throw sdkError('NotFoundException', { status: 404 });
      },
      listUsers: async () => ({ data: [] }),
    });
    expect(await missing.client.getUser('user_x')).toBeNull();
    expect(await missing.client.findUserByEmail('nobody@example.org')).toBeNull();
  });

  it('creates users with the verification the app vouches for, and deletes them', async () => {
    const { client, userManagement } = fakeSdk();
    const created = await client.createUser({ email: 'invitee@example.org', emailVerified: true, externalId: 'ensemble-uuid-2' });
    expect(created).toMatchObject({ email: 'invitee@example.org', emailVerified: true });
    expect(userManagement.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'invitee@example.org', emailVerified: true, externalId: 'ensemble-uuid-2' }));
    await client.deleteUser('user_01');
    expect(userManagement.deleteUser).toHaveBeenCalledWith('user_01');
  });

  it('starts a password reset, and says nothing for an unknown address', async () => {
    const { client, userManagement } = fakeSdk();
    await client.sendPasswordReset('ada@example.org');
    expect(userManagement.createPasswordReset).toHaveBeenCalledWith({ email: 'ada@example.org' });
    const unknown = fakeSdk({
      createPasswordReset: async () => {
        throw sdkError('NotFoundException', { status: 404 });
      },
    });
    await expect(unknown.client.sendPasswordReset('nobody@example.org')).resolves.toBeUndefined();
  });
});

describe('configuration', () => {
  it('requires an API key and a client id', () => {
    expect(() => createWorkOSIdentityClient({ apiKey: '', clientId: 'c' })).toThrow(/apiKey/);
    expect(() => createWorkOSIdentityClient({ apiKey: 'k', clientId: '' })).toThrow(/clientId/);
    expect(createWorkOSIdentityClient(CONFIG).provider).toBe('workos');
  });
});
