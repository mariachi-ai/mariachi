import { describe, expect, it } from 'vitest';
import { WorkOS } from '@workos-inc/node';
import { computeWorkOSSignature, normalizeWorkOSEventType, WorkOSWebhookHandler } from './handler';

const SECRET = 'whsec_test_secret_for_unit_tests';
const NOW = Date.parse('2026-10-22T10:00:00Z');

const event = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: 'event_01K0EXAMPLE',
    event: 'organization_membership.created',
    data: { id: 'om_01', user_id: 'user_01', organization_id: 'org_01ACME', status: 'active' },
    created_at: '2026-10-22T09:59:58.000Z',
    ...over,
  });

const signed = (body: string, t = NOW, secret = SECRET) => ({ 'workos-signature': `t=${t}, v1=${computeWorkOSSignature(secret, t, body)}` });

const handler = new WorkOSWebhookHandler({ secret: SECRET, now: () => NOW });

describe('WorkOSWebhookHandler', () => {
  it('verifies and normalizes a delivery', () => {
    const body = event();
    expect(handler.verify(body, signed(body))).toEqual({
      id: 'event_01K0EXAMPLE',
      type: 'organizationMembership.created',
      provider: 'workos',
      tenantId: 'org_01ACME',
      data: { id: 'om_01', user_id: 'user_01', organization_id: 'org_01ACME', status: 'active' },
      raw: JSON.parse(body),
      timestamp: Date.parse('2026-10-22T09:59:58.000Z'),
    });
  });

  it('accepts a Buffer body and any header case', () => {
    const body = event({ event: 'user.created', data: { id: 'user_01', email: 'a@example.org' } });
    const { 'workos-signature': sig } = signed(body);
    const out = handler.verify(Buffer.from(body), { 'WorkOS-Signature': sig });
    expect(out.type).toBe('user.created');
    expect(out.tenantId).toBeUndefined();
  });

  it('refuses a tampered body, a wrong secret, a missing or malformed header', () => {
    const body = event();
    const sig = signed(body);
    expect(() => handler.verify(body.replace('org_01ACME', 'org_01EVIL'), sig)).toThrow(/signature invalid/);
    expect(() => handler.verify(body, signed(body, NOW, 'whsec_other'))).toThrow(/signature invalid/);
    expect(() => handler.verify(body, {})).toThrow(/Missing/);
    expect(() => handler.verify(body, { 'workos-signature': 'v1=abc' })).toThrow(/Malformed/);
  });

  it('refuses a delivery signed outside the tolerance, either way', () => {
    const body = event();
    expect(() => handler.verify(body, signed(body, NOW - 181_000))).toThrow(/tolerance/);
    expect(() => handler.verify(body, signed(body, NOW + 181_000))).toThrow(/tolerance/);
    expect(handler.verify(body, signed(body, NOW - 170_000)).id).toBe('event_01K0EXAMPLE');
  });

  it('refuses a body that is not JSON, with a valid signature', () => {
    expect(() => handler.verify('not json', signed('not json'))).toThrow(/not JSON/);
  });

  it('requires a secret', () => {
    expect(() => new WorkOSWebhookHandler({ secret: '' })).toThrow(/secret/);
  });
});

describe('parity with the WorkOS SDK', () => {
  const workos = new WorkOS('sk_test_unit');

  it("accepts what the SDK's signer computes", async () => {
    const body = event();
    const t = Date.now();
    const sdkSig = await workos.webhooks.computeSignature(String(t), body, SECRET);
    const ours = new WorkOSWebhookHandler({ secret: SECRET });
    expect(ours.verify(body, { 'workos-signature': `t=${t}, v1=${sdkSig}` }).id).toBe('event_01K0EXAMPLE');
  });

  it("is accepted by the SDK's constructEvent", async () => {
    const body = event({ event: 'user.updated', data: { object: 'user', id: 'user_01', email: 'a@example.org' } });
    const t = Date.now();
    const out = await workos.webhooks.constructEvent({
      payload: body,
      sigHeader: `t=${t}, v1=${computeWorkOSSignature(SECRET, t, body)}`,
      secret: SECRET,
    });
    expect(out.event).toBe('user.updated');
  });
});

describe('normalizeWorkOSEventType', () => {
  it.each([
    ['user.created', 'user.created'],
    ['session.revoked', 'session.revoked'],
    ['organization.updated', 'organization.updated'],
    ['organization_membership.deleted', 'organizationMembership.deleted'],
    ['dsync.user.created', 'dsync.user.created'],
    ['email_verification.created', 'email_verification.created'],
  ])('%s → %s', (input, output) => {
    expect(normalizeWorkOSEventType(input)).toBe(output);
  });
});
