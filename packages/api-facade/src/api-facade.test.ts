import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createHmac } from 'node:crypto';
import { AuthError } from '@mariachi/core';
import { MemoryRateLimiter } from '@mariachi/rate-limit';
import {
  BaseController,
  bearerStrategy,
  createApiServer,
  hmacSignatureStrategy,
  serviceTokenStrategy,
  type ResolvedIdentity,
} from './index';

const silent = { info() {}, warn() {}, error() {}, debug() {}, child() { return silent; } };

const verifier = {
  async verify(token: string): Promise<ResolvedIdentity> {
    if (token === 'good') return { userId: 'u1', tenantId: 't1', scopes: ['users:read'], identityType: 'session' };
    throw new AuthError('auth/invalid-token', 'bad');
  },
};

class UsersController extends BaseController {
  readonly prefix = 'users';
  init() {
    this.get(
      ':id',
      {
        scopes: ['users:read'],
        schema: { params: z.object({ id: z.string().uuid() }), response: z.object({ id: z.string(), tenantId: z.string() }) },
      },
      async (ctx, _body, params) => ({ id: params.id, tenantId: ctx.tenantId!, extra: 'stripped' }),
    );
    this.post(
      '',
      { status: 201, scopes: ['users:write'], schema: { body: z.object({ email: z.string().email() }) } },
      async (_ctx, body) => ({ email: body.email }),
    );
    this.get('public/ping', { auth: false }, async () => ({ pong: true }));
  }
}

function app() {
  return createApiServer({ name: 'test', logger: silent, prefix: '/api' })
    .withAuthStrategy('session', bearerStrategy(verifier))
    .withAuth('session')
    .withOpenApi({ info: { title: 'Test', version: '1.0.0' } })
    .registerController(new UsersController());
}

const ID = '7f3c9f5e-7c64-4e37-9d7a-0a7c2c0b8f11';

describe('api-facade', () => {
  it('requires auth by default and rejects invalid tokens without falling through', async () => {
    const s = app();
    expect((await s.inject({ method: 'GET', url: `/api/users/${ID}` })).statusCode).toBe(401);
    const bad = await s.inject({ method: 'GET', url: `/api/users/${ID}`, headers: { authorization: 'Bearer nope' } });
    expect(bad.statusCode).toBe(401);
    expect(bad.json<{ error: { code: string } }>().error.code).toBe('auth/invalid-token');
    expect((await s.inject({ method: 'GET', url: '/api/users/public/ping' })).statusCode).toBe(200);
  });

  it('validates params and strips response fields via schema', async () => {
    const s = app();
    const ok = await s.inject({ method: 'GET', url: `/api/users/${ID}`, headers: { authorization: 'Bearer good' } });
    expect(ok.json()).toEqual({ id: ID, tenantId: 't1' });
    const invalid = await s.inject({ method: 'GET', url: '/api/users/not-a-uuid', headers: { authorization: 'Bearer good' } });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json<{ error: { details: unknown[] } }>().error.details.length).toBeGreaterThan(0);
  });

  it('enforces scopes and tenant header consistency', async () => {
    const s = app();
    const forbidden = await s.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: 'Bearer good', 'content-type': 'application/json' },
      payload: { email: 'a@b.co' },
    });
    expect(forbidden.statusCode).toBe(403);
    const mismatch = await s.inject({
      method: 'GET',
      url: `/api/users/${ID}`,
      headers: { authorization: 'Bearer good', 'x-tenant-id': 'other' },
    });
    expect(mismatch.statusCode).toBe(403);
    expect(mismatch.json<{ error: { code: string } }>().error.code).toBe('tenancy/mismatch');
  });

  it('fails at startup when a route references an unregistered strategy', async () => {
    const s = createApiServer({ name: 'x', logger: silent }).withAuth('api-key').register([
      { method: 'GET', path: '/x', handler: async () => ({}) },
    ]);
    await expect(s.ready()).rejects.toMatchObject({ code: 'api/unknown-auth-strategy' });
  });

  it('rate limits anonymous callers by IP and sets headers', async () => {
    const s = createApiServer({ name: 'rl', logger: silent })
      .withRateLimit({ limiter: new MemoryRateLimiter(), default: { windowMs: 60_000, maxRequests: 2 } })
      .register([{ method: 'GET', path: '/p', auth: false, handler: async () => ({}) }]);
    const a = await s.inject({ method: 'GET', url: '/p' });
    expect(a.headers['ratelimit-remaining']).toBe('1');
    await s.inject({ method: 'GET', url: '/p' });
    const blocked = await s.inject({ method: 'GET', url: '/p' });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(blocked.headers['ratelimit-remaining']).toBe('0');
  });

  it('verifies HMAC webhook signatures against raw bytes and service tokens in constant time', async () => {
    const secret = 'whsec_test';
    const s = createApiServer({ name: 'wh', logger: silent })
      .withAuthStrategy('webhook', hmacSignatureStrategy({ secret, header: 'x-signature', provider: 'acme', prefix: 'sha256=' }))
      .withAuthStrategy('service', serviceTokenStrategy({ tokens: { billing: 'svc-token' } }))
      .register([
        { method: 'POST', path: '/hook', auth: 'webhook', handler: async (ctx) => ({ who: ctx.userId }) },
        { method: 'GET', path: '/internal', auth: 'service', handler: async (ctx) => ({ who: ctx.userId, tenant: ctx.tenantId }) },
      ]);
    const payload = '{"event":"x"}';
    const sig = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
    const ok = await s.inject({ method: 'POST', url: '/hook', headers: { 'content-type': 'application/json', 'x-signature': sig }, payload });
    expect(ok.json()).toEqual({ who: 'webhook:acme' });
    const tampered = await s.inject({
      method: 'POST',
      url: '/hook',
      headers: { 'content-type': 'application/json', 'x-signature': sig },
      payload: '{"event":"y"}',
    });
    expect(tampered.statusCode).toBe(401);
    const svc = await s.inject({ method: 'GET', url: '/internal', headers: { 'x-service-token': 'svc-token', 'x-tenant-id': 't9' } });
    expect(svc.json()).toEqual({ who: 'service:billing', tenant: 't9' });
  });

  it('generates OpenAPI with prefix, params, security and serves it', async () => {
    const s = app();
    const res = await s.inject({ method: 'GET', url: '/api/openapi.json' });
    const doc = res.json<{ paths: Record<string, Record<string, { parameters: Array<{ name: string }>; security: unknown[] }>> }>();
    expect(Object.keys(doc.paths)).toContain('/api/users/{id}');
    expect(doc.paths['/api/users/{id}'].get.parameters[0].name).toBe('id');
    expect(doc.paths['/api/users/{id}'].get.security).toEqual([{ session: ['users:read'] }]);
    expect(doc.paths['/api/users/public/ping'].get.security).toEqual([]);
  });
});
