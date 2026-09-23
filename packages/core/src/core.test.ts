import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  createContainer,
  createKey,
  KEYS,
  createContext,
  runWithContext,
  currentContext,
  runWithSlot,
  getSlot,
  MariachiError,
  AuthError,
  NotFoundError,
  errorToHttpStatus,
  toErrorEnvelope,
  retry,
  withTimeout,
  resolveInstrumentation,
  isDisposable,
} from './index';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: () => logger };

describe('container', () => {
  it('registers and resolves typed keys', () => {
    const c = createContainer();
    const key = createKey<{ n: number }>('test.thing');
    c.register(key, { n: 1 });
    expect(c.resolve(key).n).toBe(1);
  });

  it('typed KEYS resolve values registered under the legacy raw symbols', () => {
    const c = createContainer();
    c.register(Symbol.for('mariachi.logger'), logger);
    expect(c.resolve(KEYS.Logger)).toBe(logger);
  });

  it('throws a MariachiError for missing registrations', () => {
    const c = createContainer();
    expect(() => c.resolve(KEYS.Cache)).toThrow(MariachiError);
    expect(c.tryResolve(KEYS.Cache)).toBeUndefined();
  });

  it('scopes fall through to the parent without leaking registrations upward', () => {
    const parent = createContainer();
    parent.register(KEYS.Logger, logger);
    const child = parent.createScope();
    child.register(KEYS.Cache, 'cache');
    expect(child.resolve(KEYS.Logger)).toBe(logger);
    expect(parent.has(KEYS.Cache)).toBe(false);
  });
});

describe('resolveInstrumentation', () => {
  it('prefers explicit deps over the container', () => {
    const c = createContainer();
    const other = { ...logger };
    c.register(KEYS.Logger, other);
    expect(resolveInstrumentation({ logger }, c).logger).toBe(logger);
    expect(resolveInstrumentation({}, c).logger).toBe(other);
  });

  it('fails loudly when no logger is available', () => {
    expect(() => resolveInstrumentation({}, createContainer())).toThrow(/No logger/);
  });
});

describe('context store', () => {
  it('propagates context across awaits', async () => {
    const ctx = createContext({ logger, userId: 'u1' });
    await runWithContext(ctx, async () => {
      await new Promise((r) => setTimeout(r, 1));
      expect(currentContext()?.userId).toBe('u1');
    });
    expect(currentContext()).toBeUndefined();
  });

  it('binds slots for nested scopes only', async () => {
    const key = Symbol('tx');
    const ctx = createContext({ logger });
    await runWithContext(ctx, async () => {
      await runWithSlot(key, 'tx1', async () => {
        expect(getSlot(key)).toBe('tx1');
        expect(currentContext()).toBe(ctx);
      });
      expect(getSlot(key)).toBeUndefined();
    });
  });
});

describe('errors', () => {
  it('maps codes to HTTP statuses, most specific first', () => {
    expect(errorToHttpStatus(new AuthError('auth/forbidden', 'x'))).toBe(403);
    expect(errorToHttpStatus(new AuthError('auth/something-else', 'x'))).toBe(401);
    expect(errorToHttpStatus(new MariachiError('billing/customer/not-found', 'x'))).toBe(404);
    expect(errorToHttpStatus(new NotFoundError('User', '1'))).toBe(404);
    expect(errorToHttpStatus(new MariachiError('database/query-failed', 'x'))).toBe(500);
  });

  it('maps domain package codes that the prefix rules would get wrong', () => {
    const status = (code: string) => errorToHttpStatus(new MariachiError(code, 'x'));
    expect(status('rate-limit/exceeded')).toBe(429);
    expect(status('rate-limit/backend-failed')).toBe(503);   // not "slow down"
    expect(status('rate-limit/unknown-tier')).toBe(500);
    expect(status('auth/unknown-role')).toBe(400);           // not 401
    expect(status('storage/invalid-signature')).toBe(403);
    expect(status('search/missing-query-fields')).toBe(400);
    expect(status('search/index-exists')).toBe(409);
    expect(status('ai/providers-exhausted')).toBe(502);
    expect(status('ai/token-budget-exceeded')).toBe(402);
    expect(status('notifications/invalid-input')).toBe(400);
    expect(status('integrations/invalid-signature')).toBe(401);
  });

  it('builds envelopes that hide 5xx messages and expand Zod issues', () => {
    const internal = toErrorEnvelope(new MariachiError('database/query-failed', 'secret detail'), 't1');
    expect(internal.status).toBe(500);
    expect(internal.body.error.message).toBe('Internal Server Error');
    expect(internal.body.error.traceId).toBe('t1');

    const zod = z.object({ a: z.string() }).safeParse({});
    const env = toErrorEnvelope(zod.error);
    expect(env.status).toBe(400);
    expect(env.body.error.code).toBe('validation/invalid-input');
    expect(Array.isArray(env.body.error.details)).toBe(true);
  });
});

describe('retry', () => {
  it('retries until success', async () => {
    let n = 0;
    const result = await retry(async () => {
      n++;
      if (n < 3) throw new Error('flaky');
      return 'ok';
    }, { baseDelayMs: 1, jitter: false });
    expect(result).toBe('ok');
    expect(n).toBe(3);
  });

  it('stops when retryOn returns false', async () => {
    let n = 0;
    await expect(retry(async () => { n++; throw new Error('fatal'); }, { retryOn: () => false })).rejects.toThrow('fatal');
    expect(n).toBe(1);
  });

  it('withTimeout rejects with the given code', async () => {
    await expect(withTimeout(new Promise(() => {}), 5, 'communication/timeout')).rejects.toMatchObject({
      code: 'communication/timeout',
    });
  });
});

describe('isDisposable', () => {
  it('detects the Disposable shape', () => {
    expect(isDisposable({ connect: async () => {}, disconnect: async () => {}, isHealthy: async () => true })).toBe(true);
    expect(isDisposable({ connect: async () => {} })).toBe(false);
  });
});
