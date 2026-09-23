import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { IntegrationError } from '@mariachi/core';
import { defineIntegrationFn, verifySlackSignature } from './index';
import { IntegrationRegistry } from './registry';
import { resolveTenantCredential } from './credentials';

describe('integrations', () => {
  it('invokes a registered function', async () => {
    const echo = defineIntegrationFn({
      name: 'echo',
      input: z.object({ text: z.string() }),
      output: z.object({ text: z.string() }),
      handler: async (input) => input,
    });
    const registry = new IntegrationRegistry();
    registry.register({ name: 'demo', description: 'demo', credentialSchema: z.object({}), functions: ['echo'], handlers: { echo } });
    await expect(registry.call('demo.echo', { text: 'hi' }, {})).resolves.toEqual({ text: 'hi' });
  });

  it('rejects functions without handlers and ambiguous bare names', () => {
    const echo = defineIntegrationFn({ name: 'echo', input: z.object({}), output: z.object({}), handler: async () => ({}) });
    const registry = new IntegrationRegistry();
    expect(() => registry.register({ name: 'bad', description: '', credentialSchema: z.object({}), functions: ['bad.send'] }))
      .toThrow(expect.objectContaining({ code: 'integrations/missing-handler' }));
    registry.register({ name: 'a', description: '', credentialSchema: z.object({}), functions: ['a.echo'], handlers: { echo } });
    registry.register({ name: 'b', description: '', credentialSchema: z.object({}), functions: ['echo'], handlers: { echo } });
    return Promise.all([
      expect(registry.call('echo', {}, {})).rejects.toMatchObject({ code: 'integrations/ambiguous-function' }),
      expect(registry.call('b.echo', {}, {})).resolves.toEqual({}),
    ]);
  });

  it('does not retry invalid input or missing credentials', async () => {
    let calls = 0;
    const fn = defineIntegrationFn({
      name: 'flaky',
      input: z.object({ n: z.number() }),
      output: z.object({ ok: z.boolean() }),
      retry: { attempts: 3, backoff: 'linear' },
      handler: async (input) => {
        calls += 1;
        if (input.n === 0) throw new IntegrationError('integrations/missing-credential', 'no token');
        if (calls < 3) throw new Error('transient');
        return { ok: true };
      },
    });
    await expect(fn({ n: 'x' }, {})).rejects.toMatchObject({ code: 'integrations/invalid-input' });
    expect(calls).toBe(0);
    await expect(fn({ n: 0 }, {})).rejects.toMatchObject({ code: 'integrations/missing-credential' });
    expect(calls).toBe(1);
    calls = 0;
    await expect(fn({ n: 1 }, {})).resolves.toEqual({ ok: true });
    expect(calls).toBe(3);
  });

  it('decrypts the tenant secret', async () => {
    const value = await resolveTenantCredential({ tenantId: 't1' }, 'slack.botToken', {
      async get(key, tenantId) { return tenantId === 't1' && key === 'slack.botToken' ? 'cipher' : undefined; },
    }, { async decrypt(ciphertext) { return ciphertext === 'cipher' ? 'xoxb' : ''; } });
    expect(value).toBe('xoxb');
  });

  it('can refuse to fall back to the global credential', async () => {
    const secrets = { async get(_key: string, tenantId?: string) { return tenantId ? undefined : 'global-token'; } };
    expect(await resolveTenantCredential({ tenantId: 't1' }, 'k', secrets)).toBe('global-token');
    await expect(resolveTenantCredential({ tenantId: 't1' }, 'k', secrets, undefined, { fallbackToGlobal: false })).rejects.toMatchObject({
      code: 'integrations/missing-credential',
    });
    await expect(resolveTenantCredential({}, 'k', secrets, undefined, { fallbackToGlobal: false })).rejects.toMatchObject({
      code: 'integrations/missing-credential',
    });
  });

  it('verifies a slack signature', () => {
    const secret = 'signing';
    const body = 'token=1';
    const timestamp = '1700000000';
    const signature = `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex')}`;
    expect(verifySlackSignature(secret, { 'x-slack-signature': signature, 'x-slack-request-timestamp': timestamp }, body, 1700000000 * 1000)).toBe(true);
    expect(verifySlackSignature(secret, { 'x-slack-signature': signature, 'x-slack-request-timestamp': timestamp }, 'tampered', 1700000000 * 1000)).toBe(false);
  });
});
