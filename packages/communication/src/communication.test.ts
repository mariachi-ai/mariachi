import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createContext, currentContext, ValidationError, AuthError, CommunicationError } from '@mariachi/core';
import { createCommunication, defineProcedure, authMiddleware } from './index';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: () => logger };
const ctx = (over = {}) => createContext({ logger, userId: 'u1', tenantId: 't1', scopes: ['users:write'], ...over });

const echo = defineProcedure({
  schema: { input: z.object({ name: z.string() }), output: z.object({ greeting: z.string() }) },
  handler: async (_ctx, input) => ({ greeting: `hi ${input.name}` }),
});

describe('communication', () => {
  it('calls ctx-first and validates input/output', async () => {
    const comm = createCommunication({}, { logger });
    comm.register('greet.say', echo);
    expect(await comm.call(ctx(), 'greet.say', { name: 'a' })).toEqual({ greeting: 'hi a' });
    await expect(comm.call(ctx(), 'greet.say', { name: 1 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects duplicate registrations unless override is set', () => {
    const comm = createCommunication({}, { logger });
    comm.register('greet.say', echo);
    expect(() => comm.register('greet.say', echo)).toThrow(/already registered/);
    expect(() => comm.register('greet.say', echo, { override: true })).not.toThrow();
  });

  it('times out slow handlers', async () => {
    const comm = createCommunication({ defaultTimeoutMs: 20 }, { logger });
    comm.register('slow.op', {
      schema: { input: z.any(), output: z.any() },
      handler: () => new Promise((r) => setTimeout(r, 200)),
    });
    await expect(comm.call(ctx(), 'slow.op', {})).rejects.toMatchObject({ code: 'communication/timeout' });
  });

  it('fails when a middleware short-circuits', async () => {
    const comm = createCommunication({}, { logger });
    comm.use(async () => {});
    comm.register('greet.say', echo);
    await expect(comm.call(ctx(), 'greet.say', { name: 'a' })).rejects.toMatchObject({ code: 'communication/short-circuited' });
  });

  it('makes the procedure context ambient inside handlers', async () => {
    const comm = createCommunication({}, { logger });
    comm.register('ctx.echo', {
      schema: { input: z.any(), output: z.string() },
      handler: async () => currentContext()?.traceId ?? 'none',
    });
    const c = ctx();
    expect(await comm.call(c, 'ctx.echo', {})).toBe(c.traceId);
  });

  it('enforces required scopes and auth middleware', async () => {
    const comm = createCommunication({}, { logger });
    comm.register('admin.op', { ...echo, requiredScopes: ['admin'] });
    await expect(comm.call(ctx(), 'admin.op', { name: 'a' })).rejects.toBeInstanceOf(AuthError);

    comm.register('secure.op', { ...echo, middleware: [authMiddleware()] });
    await expect(comm.call(ctx({ userId: null }), 'secure.op', { name: 'a' })).rejects.toMatchObject({ code: 'auth/unauthorized' });
  });

  it('flags invalid handler output', async () => {
    const comm = createCommunication({}, { logger });
    comm.register('bad.out', { schema: { input: z.any(), output: z.number() }, handler: async () => 'nope' as unknown as number });
    await expect(comm.call(ctx(), 'bad.out', {})).rejects.toBeInstanceOf(CommunicationError);
  });
});
