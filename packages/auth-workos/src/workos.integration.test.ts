import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorkOSAuth, createWorkOSIdentityClient } from './index';

/**
 * Against a real WorkOS staging environment: `WORKOS_API_KEY` (`sk_test_…`) and `WORKOS_CLIENT_ID`.
 * Skipped without them. Every user it creates is deleted. Emails use example.org: WorkOS's sample
 * organization claims example.com for its test SSO connection.
 */
const apiKey = process.env.WORKOS_API_KEY ?? '';
const clientId = process.env.WORKOS_CLIENT_ID ?? '';
const enabled = apiKey.startsWith('sk_test_') && clientId.startsWith('client_');

describe.skipIf(!enabled)('WorkOS staging', () => {
  // Built in beforeAll: a skipped describe still runs its body while the file is collected.
  let identity: ReturnType<typeof createWorkOSIdentityClient>;
  let auth: ReturnType<typeof createWorkOSAuth>;
  beforeAll(() => {
    identity = createWorkOSIdentityClient({ apiKey, clientId });
    auth = createWorkOSAuth({ clientId });
  });
  const created: string[] = [];
  const email = (tag: string) => `mariachi-it-${tag}-${randomBytes(4).toString('hex')}@example.org`;
  const password = () => `${randomBytes(18).toString('base64url')}Aa1!`;

  afterAll(async () => {
    await Promise.all(created.map((id) => identity.deleteUser(id)));
  });

  it('signs in with a password; the access token verifies and names the session', async () => {
    const addr = email('pw');
    const pw = password();
    const user = await identity.createUser({ email: addr, emailVerified: true, password: pw, externalId: `ext-${randomBytes(4).toString('hex')}` });
    created.push(user.id);
    expect(user).toMatchObject({ email: addr, emailVerified: true });

    const out = await identity.signInWithPassword({ email: addr, password: pw });
    if (out.status !== 'signed-in') throw new Error(`expected signed-in, got ${out.status}`);
    expect(out.user.id).toBe(user.id);
    expect(out.tokens.sessionId).toMatch(/^session_/);

    const resolved = await auth.verify(out.tokens.accessToken);
    expect(resolved).toMatchObject({ userId: user.id, sessionId: out.tokens.sessionId, identityType: 'session' });

    // Refresh keeps the session. (WorkOS's docs say the refresh token rotates on every use; this
    // staging environment returned the same one, 2026-10-22, so rotation isn't asserted.)
    const next = await identity.refresh(out.tokens.refreshToken);
    expect(next.sessionId).toBe(out.tokens.sessionId);
    expect((await auth.verify(next.accessToken)).userId).toBe(user.id);

    // Signing out revokes the session: its refresh token stops working.
    await identity.signOut({ sessionId: out.tokens.sessionId });
    await expect(identity.refresh(next.refreshToken)).rejects.toMatchObject({ code: 'auth/invalid-grant' });
  });

  it('refuses a wrong password', async () => {
    const addr = email('wrong');
    const user = await identity.createUser({ email: addr, emailVerified: true, password: password() });
    created.push(user.id);
    await expect(identity.signInWithPassword({ email: addr, password: password() })).rejects.toMatchObject({ code: 'auth/invalid-credentials' });
  });

  it('holds an unverified email at a pending sign-in', async () => {
    const addr = email('unverified');
    const pw = password();
    const user = await identity.createUser({ email: addr, emailVerified: false, password: pw });
    created.push(user.id);
    const out = await identity.signInWithPassword({ email: addr, password: pw });
    expect(out).toMatchObject({ status: 'pending', reason: 'email-verification', email: addr });
    if (out.status === 'pending') {
      expect(out.pendingToken).toBeTruthy();
      expect(out.providerData?.emailVerificationId).toMatch(/^email_verification_/);
    }
  });

  it('verified-first sign-up: an email code signs in a verified user, who then sets a password', async () => {
    const addr = email('signup');
    const start = await identity.startEmailCode(addr);
    if (start.deliveredBy !== 'app') throw new Error(`expected the app to send the code, got ${start.deliveredBy}`);
    expect(start.code).toMatch(/^\d{6}$/);
    const out = await identity.signInWithEmailCode({ email: addr, code: start.code });
    if (out.status !== 'signed-in') throw new Error(`expected signed-in, got ${out.status}`);
    created.push(out.user.id);
    expect(out.user).toMatchObject({ email: addr, emailVerified: true });
    const pw = password();
    await identity.setPassword(out.user.id, pw);
    const again = await identity.signInWithPassword({ email: addr, password: pw });
    expect(again.status).toBe('signed-in');
    await expect(identity.signInWithEmailCode({ email: addr, code: start.code })).rejects.toMatchObject({ code: 'auth/invalid-grant' });
  });

  it('password reset: a token for the app to email, then the new password works and the old one does not', async () => {
    const addr = email('reset');
    const oldPw = password();
    const user = await identity.createUser({ email: addr, emailVerified: true, password: oldPw });
    created.push(user.id);
    const reset = await identity.sendPasswordReset(addr);
    if (reset.deliveredBy !== 'app') throw new Error(`expected the app to send the link, got ${reset.deliveredBy}`);
    const newPw = password();
    expect((await identity.resetPassword({ token: reset.token, password: newPw })).id).toBe(user.id);
    expect((await identity.signInWithPassword({ email: addr, password: newPw })).status).toBe('signed-in');
    await expect(identity.signInWithPassword({ email: addr, password: oldPw })).rejects.toMatchObject({ code: 'auth/invalid-credentials' });
    expect(await identity.sendPasswordReset(email('nobody'))).toEqual({ deliveredBy: 'nobody' });
  });

  it('a sign-in held at email verification: the app gets the code and finishes it', async () => {
    const addr = email('held');
    const pw = password();
    const user = await identity.createUser({ email: addr, emailVerified: false, password: pw });
    created.push(user.id);
    const held = await identity.signInWithPassword({ email: addr, password: pw });
    if (held.status !== 'pending') throw new Error('expected a pending sign-in');
    const code = await identity.pendingVerificationCode(held);
    const done = await identity.verifyEmailAndSignIn({ pendingToken: held.pendingToken!, code });
    if (done.status !== 'signed-in') throw new Error(`expected signed-in, got ${done.status}`);
    expect(done.user.emailVerified).toBe(true);
  });

  it('finds users by id and email; a deleted user is gone', async () => {
    const addr = email('lookup');
    const user = await identity.createUser({ email: addr, emailVerified: true, name: 'Lookup Test' });
    expect((await identity.getUser(user.id))?.email).toBe(addr);
    expect((await identity.findUserByEmail(addr.toUpperCase()))?.id).toBe(user.id);
    await identity.deleteUser(user.id);
    expect(await identity.getUser(user.id)).toBeNull();
    expect(await identity.findUserByEmail(addr)).toBeNull();
  });
});
