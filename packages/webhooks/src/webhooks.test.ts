import { createHmac, timingSafeEqual } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { InMemoryIdempotencyStore, type Context } from '@mariachi/core';
import type { IncomingRequest } from '@mariachi/server';
import { SignatureAuthController, WebhookController, WebhookServer, redactHeaders, type WebhookLogStore } from './index';

const silent = { info() {}, warn() {}, error() {}, debug() {}, child() { return silent; } };
const SECRET = 'whsec';

class AcmeAuth extends SignatureAuthController {
  readonly provider = 'acme';
  readonly signatureHeader = 'x-acme-signature';
  protected readonly eventIdHeader = 'x-acme-delivery';
  protected async verifySignature(sig: string, raw: Buffer) {
    const expected = Buffer.from(createHmac('sha256', SECRET).update(raw).digest('hex'));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }
  protected resolveTenant(req: IncomingRequest) {
    return req.params.tenant;
  }
}

class AcmeController extends WebhookController {
  readonly prefix = 'acme';
  readonly auth = new AcmeAuth();
  init() {
    this.post(':tenant/events', { mode: 'direct', procedure: 'acme.event' }, async (_ctx, body) => body);
  }
}

function memoryLogStore() {
  const entries: Array<{ headers: Record<string, string>; status: string }> = [];
  const store: WebhookLogStore = {
    async log(e) {
      entries.push({ headers: e.headers, status: e.status });
      return String(entries.length);
    },
    async update(id, patch) {
      if (patch.status) entries[Number(id) - 1].status = patch.status;
    },
    async query() {
      return [];
    },
    async cleanup() {
      return 0;
    },
  };
  return { store, entries };
}

describe('webhooks', () => {
  it('verifies raw body, carries tenant, redacts headers and dedups deliveries', async () => {
    const calls: Array<{ ctx: Context; input: unknown }> = [];
    const communication = {
      call: async (ctx: Context, _name: string, input: unknown) => {
        calls.push({ ctx, input });
        return { ok: true };
      },
    } as never;
    const { store, entries } = memoryLogStore();
    const server = new WebhookServer(
      { name: 'webhooks', logger: silent },
      { communication, logStore: store, idempotency: new InMemoryIdempotencyStore() },
    ).registerController(new AcmeController());

    const payload = '{"type":"invoice.paid"}';
    const sig = createHmac('sha256', SECRET).update(payload).digest('hex');
    const headers = { 'content-type': 'application/json', 'x-acme-signature': sig, 'x-acme-delivery': 'evt_1', authorization: 'Bearer x' };
    const first = await server.inject({ method: 'POST', url: '/acme/t42/events', headers, payload });
    expect(first.statusCode).toBe(200);
    expect(calls[0].ctx.tenantId).toBe('t42');
    expect(calls[0].input).toEqual({ type: 'invoice.paid' });
    expect(entries[0].headers['x-acme-signature']).toBe('[redacted]');
    expect(entries[0].headers.authorization).toBe('[redacted]');
    expect(entries[0].status).toBe('processed');

    const dup = await server.inject({ method: 'POST', url: '/acme/t42/events', headers, payload });
    expect(dup.json()).toMatchObject({ duplicate: true });
    expect(calls).toHaveLength(1);

    const bad = await server.inject({ method: 'POST', url: '/acme/t42/events', headers: { ...headers, 'x-acme-delivery': 'evt_2' }, payload: '{"type":"tampered"}' });
    expect(bad.statusCode).toBe(401);
  });

  it('redactHeaders masks credentials and signatures', () => {
    expect(redactHeaders({ 'stripe-signature': 'x', cookie: 'y', 'x-custom': 'z' }, ['x-custom'])).toEqual({
      'stripe-signature': '[redacted]',
      cookie: '[redacted]',
      'x-custom': '[redacted]',
    });
  });
});