import { describe, expect, it } from 'vitest';
import { NotFoundError, currentContext } from '@mariachi/core';
import { FastifyServerAdapter, httpResponse } from './index';

const silent = { info() {}, warn() {}, error() {}, debug() {}, child() { return silent; } };

function server(extra: Partial<ConstructorParameters<typeof FastifyServerAdapter>[0]> = {}) {
  return new FastifyServerAdapter({ name: 'test', logger: silent, ...extra });
}

describe('FastifyServerAdapter', () => {
  it('takes the trace id from traceparent and wraps requests in a span', async () => {
    const spans: Array<{ name: string; attrs: Record<string, unknown>; status?: string }> = [];
    const tracer = {
      async withSpan<T>(name: string, fn: (span: never) => Promise<T>): Promise<T> {
        const rec = { name, attrs: {} as Record<string, unknown>, status: undefined as string | undefined };
        spans.push(rec);
        const span = {
          setAttribute: (k: string, v: unknown) => {
            rec.attrs[k] = v;
          },
          setStatus: (s: string) => {
            rec.status = s;
          },
          recordException() {},
          end() {},
        };
        return fn(span as never);
      },
    };
    const s = server({ tracer: tracer as never }).register([
      { method: 'GET', path: '/t/:id', handler: async (ctx) => ({ trace: ctx.traceId, ambient: currentContext()?.traceId }) },
    ]);
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const res = await s.inject({ method: 'GET', url: '/t/1', headers: { traceparent: `00-${traceId}-00f067aa0ba902b7-01` } });
    expect(res.json()).toEqual({ trace: traceId, ambient: traceId });
    expect(spans[0]).toMatchObject({ name: 'http.request', attrs: { 'http.method': 'GET', 'http.route': '/t/:id', traceId }, status: 'ok' });

    const fallback = await s.inject({ method: 'GET', url: '/t/2', headers: { traceparent: 'garbage', 'x-request-id': 'req-12345678' } });
    expect(fallback.json<{ trace: string }>().trace).toBe('req-12345678');
  });

  it('preserves the exact raw body alongside parsed JSON', async () => {
    const s = server().register([
      { method: 'POST', path: '/echo', handler: async (_ctx, req) => ({ raw: req.rawBody?.toString('utf8'), body: req.body }) },
    ]);
    const payload = '{"a":1,  "b":"x"}';
    const res = await s.inject({ method: 'POST', url: '/echo', headers: { 'content-type': 'application/json' }, payload });
    expect(res.json()).toEqual({ raw: payload, body: { a: 1, b: 'x' } });
  });

  it('returns the standard error envelope and hides 5xx messages', async () => {
    const s = server().register([
      { method: 'GET', path: '/missing', handler: async () => { throw new NotFoundError('user', '1'); } },
      { method: 'GET', path: '/boom', handler: async () => { throw new TypeError('secret internals'); } },
    ]);
    const nf = await s.inject({ method: 'GET', url: '/missing' });
    expect(nf.statusCode).toBe(404);
    expect(nf.json<{ error: { code: string; traceId: string } }>().error.code).toBe('not-found');
    const boom = await s.inject({ method: 'GET', url: '/boom' });
    expect(boom.statusCode).toBe(500);
    expect(boom.body).not.toContain('secret internals');
  });

  it('propagates a valid incoming request id and rejects junk ids', async () => {
    const s = server().register([{ method: 'GET', path: '/id', handler: async (ctx) => ({ id: ctx.requestId, ambient: currentContext()?.traceId }) }]);
    const ok = await s.inject({ method: 'GET', url: '/id', headers: { 'x-request-id': 'req-12345678' } });
    expect(ok.json()).toEqual({ id: 'req-12345678', ambient: 'req-12345678' });
    expect(ok.headers['x-request-id']).toBe('req-12345678');
    const junk = await s.inject({ method: 'GET', url: '/id', headers: { 'x-request-id': 'bad id <script>' } });
    expect(junk.json<{ id: string }>().id).not.toBe('bad id <script>');
  });

  it('applies prefix, security headers, custom status and 204 for undefined', async () => {
    const s = server({ prefix: '/api/v1/' }).register([
      { method: 'POST', path: 'things', handler: async () => httpResponse(201, { ok: true }, { location: '/things/1' }) },
      { method: 'DELETE', path: '/things/:id', handler: async () => undefined },
    ]);
    const created = await s.inject({ method: 'POST', url: '/api/v1/things' });
    expect(created.statusCode).toBe(201);
    expect(created.headers.location).toBe('/things/1');
    expect(created.headers['x-content-type-options']).toBe('nosniff');
    expect((await s.inject({ method: 'DELETE', url: '/api/v1/things/1' })).statusCode).toBe(204);
  });

  it('enforces CORS allowlist on preflight', async () => {
    const s = server({ cors: { origins: ['https://app.example.com'], credentials: true } }).register([
      { method: 'GET', path: '/x', handler: async () => ({}) },
    ]);
    const allowed = await s.inject({
      method: 'OPTIONS',
      url: '/x',
      headers: { origin: 'https://app.example.com', 'access-control-request-method': 'GET' },
    });
    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example.com');
    const denied = await s.inject({
      method: 'OPTIONS',
      url: '/x',
      headers: { origin: 'https://evil.example.com', 'access-control-request-method': 'GET' },
    });
    expect(denied.statusCode).toBe(403);
  });

  it('rejects oversized bodies with 413', async () => {
    const s = server({ bodyLimitBytes: 10 }).register([{ method: 'POST', path: '/b', handler: async () => ({}) }]);
    const res = await s.inject({ method: 'POST', url: '/b', headers: { 'content-type': 'application/json' }, payload: '{"a":"0123456789"}' });
    expect(res.statusCode).toBe(413);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('http/payload-too-large');
  });
});
