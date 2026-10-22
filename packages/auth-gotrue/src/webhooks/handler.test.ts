import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AUTH_EVENT_TYPES } from '@mariachi/auth';
import { createGoTrueAuth } from '../index';
import { GoTrueWebhookHandler, normalizeGoTrueHook } from './handler';
import { parseWebhookSecrets, signStandardWebhook } from './standard-webhooks';

const rawKey = randomBytes(32);
const SECRET = `v1,whsec_${rawKey.toString('base64')}`;
const NOW = 1_792_582_489;

function signed(body: unknown, opts: { key?: Buffer; id?: string; ts?: number; extraSigs?: string[] } = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const id = opts.id ?? '1829016b-5988-4ebd-8c06-5536bc34c8f6';
  const ts = opts.ts ?? NOW;
  const sig = signStandardWebhook(opts.key ?? rawKey, id, ts, raw);
  return {
    raw,
    headers: {
      'webhook-id': id,
      'webhook-timestamp': String(ts),
      'webhook-signature': [...(opts.extraSigs ?? []), sig].join(' '),
      'content-type': 'application/json',
    } as Record<string, string>,
  };
}

// The access-token hook's payload as GoTrue v2.197.0 sent it (reports/AU0/05d-hook-http-payload.json).
const accessTokenHook = (method = 'password') => ({
  metadata: { uuid: '1a5e06fe-1dae-42a2-9a25-9f2eb12f56ad', time: '2026-10-21T11:34:49.023243544Z', name: 'customize-access-token', ip_address: '172.21.0.5' },
  user_id: '190fe7b7-ba4b-46b6-950a-d3e323803432',
  claims: {
    iss: 'http://localhost:18081/auth/v1',
    sub: '190fe7b7-ba4b-46b6-950a-d3e323803432',
    aud: 'authenticated',
    role: 'authenticated',
    aal: 'aal1',
    session_id: 'eb494b2e-923a-47a9-8e5e-e9e294fc891e',
    org_id: 'org-acme',
  },
  authentication_method: method,
});

const handler = () => new GoTrueWebhookHandler({ secret: SECRET, nowSeconds: () => NOW });

describe('GoTrueWebhookHandler', () => {
  it('verifies a signed customize-access-token hook and normalizes it to session.created', () => {
    const { raw, headers } = signed(accessTokenHook());
    const event = handler().verify(raw, headers);
    expect(event).toMatchObject({
      id: '1829016b-5988-4ebd-8c06-5536bc34c8f6',
      type: 'session.created',
      provider: 'gotrue',
      tenantId: 'org-acme',
      data: { userId: '190fe7b7-ba4b-46b6-950a-d3e323803432', authenticationMethod: 'password' },
      timestamp: Date.parse('2026-10-21T11:34:49.023Z'),
    });
    expect(AUTH_EVENT_TYPES).toContain(event.type);
    expect(event.raw).toEqual(accessTokenHook());
  });

  it('normalizes each GoTrue hook name', () => {
    expect(normalizeGoTrueHook('after-user-created')).toBe('user.created');
    expect(normalizeGoTrueHook('send-email')).toBe('email.created');
    expect(normalizeGoTrueHook('customize-access-token', 'magiclink')).toBe('session.created');
    expect(normalizeGoTrueHook('customize-access-token', 'token_refresh')).toBe('session.refreshed');
    for (const passthrough of ['before-user-created', 'send-sms', 'mfa-verification', 'password-verification']) {
      expect(normalizeGoTrueHook(passthrough)).toBe(passthrough);
    }
    for (const t of ['user.created', 'email.created', 'session.created']) expect(AUTH_EVENT_TYPES).toContain(t);
  });

  it('carries the user for user hooks and the email data for send-email', () => {
    const user = { id: 'u-1', email: 'new@example.test', app_metadata: { provider: 'email' } };
    const created = signed({ metadata: { name: 'after-user-created', time: '2026-10-21T11:00:00Z' }, user });
    expect(handler().verify(created.raw, created.headers)).toMatchObject({ type: 'user.created', data: user });
    const email = signed({
      metadata: { name: 'send-email' },
      user,
      email_data: { token: '123456', token_hash: 'abc', redirect_to: 'https://app.example/welcome', email_action_type: 'magiclink', site_url: 'https://app.example' },
    });
    const ev = handler().verify(Buffer.from(email.raw), email.headers);
    expect(ev.type).toBe('email.created');
    expect(ev.data).toMatchObject({ user, email: { email_action_type: 'magiclink' } });
    expect(ev.timestamp).toBe(NOW * 1000);
  });

  it('accepts any of several signatures and any of several secrets (a rotation)', () => {
    const otherKey = randomBytes(32);
    const both = new GoTrueWebhookHandler({ secret: `v1,whsec_${otherKey.toString('base64')}|${SECRET}`, nowSeconds: () => NOW });
    const { raw, headers } = signed(accessTokenHook(), { extraSigs: ['v1,bm90LXRoaXMtb25l'] });
    expect(both.verify(raw, headers).type).toBe('session.created');
    const byOther = signed(accessTokenHook(), { key: otherKey });
    expect(both.verify(byOther.raw, byOther.headers).type).toBe('session.created');
    expect(() => handler().verify(byOther.raw, byOther.headers)).toThrow(expect.objectContaining({ code: 'auth/webhook-verification-failed' }));
  });

  it('fails closed: tampered body, wrong secret, stale or future timestamp, missing headers, non-v1 signatures', () => {
    const h = handler();
    const { raw, headers } = signed(accessTokenHook());
    const fails = (b: string, hs: Record<string, string | undefined>) =>
      expect(() => h.verify(b, hs)).toThrow(expect.objectContaining({ code: 'auth/webhook-verification-failed' }));
    fails(raw.replace('org-acme', 'org-evil'), headers);
    fails(raw, { ...headers, 'webhook-id': 'another-id' });
    const stale = signed(accessTokenHook(), { ts: NOW - 301 });
    fails(stale.raw, stale.headers);
    const future = signed(accessTokenHook(), { ts: NOW + 301 });
    fails(future.raw, future.headers);
    fails(raw, { ...headers, 'webhook-signature': undefined });
    fails(raw, { ...headers, 'webhook-timestamp': undefined });
    fails(raw, { ...headers, 'webhook-timestamp': '1792582489.5' });
    fails(raw, { ...headers, 'webhook-signature': headers['webhook-signature']!.replace(/^v1,/, 'v1a,') });
    const wrongKey = signed(accessTokenHook(), { key: randomBytes(32) });
    fails(wrongKey.raw, wrongKey.headers);
  });

  it('reads headers case-insensitively and from arrays', () => {
    const { raw, headers } = signed(accessTokenHook());
    const upper = {
      'Webhook-Id': [headers['webhook-id']!],
      'WEBHOOK-TIMESTAMP': headers['webhook-timestamp'],
      'Webhook-Signature': headers['webhook-signature'],
    };
    expect(handler().verify(raw, upper).type).toBe('session.created');
  });

  it('refuses a body that is not a JSON object, after the signature checks', () => {
    const notJson = signed('not json');
    expect(() => handler().verify(notJson.raw, notJson.headers)).toThrow(expect.objectContaining({ code: 'auth/webhook-invalid-payload' }));
    const arr = signed('[1,2]');
    expect(() => handler().verify(arr.raw, arr.headers)).toThrow(expect.objectContaining({ code: 'auth/webhook-invalid-payload' }));
  });

  it('refuses a missing or malformed secret at construction', () => {
    expect(() => new GoTrueWebhookHandler({ secret: '' })).toThrow(expect.objectContaining({ code: 'auth/invalid-config' }));
    expect(() => new GoTrueWebhookHandler({ secret: 'v1,whsec_not base64!' })).toThrow(expect.objectContaining({ code: 'auth/invalid-config' }));
    expect(() => new GoTrueWebhookHandler({ secret: 'v1,whsec_c2hvcnQ=' })).toThrow(/16 bytes/);
    expect(parseWebhookSecrets([`whsec_${rawKey.toString('base64')}`, rawKey.toString('base64')])).toHaveLength(2);
  });

  it('is what the provider hands out, with the provider’s org claim', () => {
    const provider = createGoTrueAuth({ url: 'https://app.example/auth/v1', orgClaim: 'tenant' });
    const h = provider.createWebhookHandler({ secret: SECRET });
    expect(h).toBeInstanceOf(GoTrueWebhookHandler);
    const now = Math.floor(Date.now() / 1000);
    const body = { ...accessTokenHook(), claims: { ...accessTokenHook().claims, tenant: 't-1' } };
    const { raw, headers } = signed(body, { ts: now });
    expect(h.verify(raw, headers).tenantId).toBe('t-1');
  });
});
