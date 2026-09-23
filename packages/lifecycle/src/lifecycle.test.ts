import { describe, it, expect, vi } from 'vitest';
import { KEYS, getContainer } from '@mariachi/core';
import { Lifecycle, ShutdownManager, bootstrapForTest } from './index';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: () => logger };

function resource(log: string[], name: string, healthy = true) {
  return {
    connect: async () => void log.push(`connect:${name}`),
    disconnect: async () => void log.push(`disconnect:${name}`),
    isHealthy: async () => healthy,
  };
}

describe('Lifecycle', () => {
  it('starts in priority order and stops in reverse', async () => {
    const log: string[] = [];
    const lc = new Lifecycle(logger);
    lc.manage('db', resource(log, 'db'), { priority: 10 });
    lc.manage('cache', resource(log, 'cache'), { priority: 20 });
    await lc.start();
    await lc.stop();
    expect(log).toEqual(['connect:db', 'connect:cache', 'disconnect:cache', 'disconnect:db']);
  });

  it('separates startup, readiness and draining', async () => {
    const lc = new Lifecycle(logger);
    lc.manage('db', resource([], 'db', true));
    lc.manage('search', resource([], 'search', false), { critical: false });
    expect((await lc.health.startup()).status).toBe('unhealthy');
    expect((await lc.health.readiness()).status).toBe('unhealthy');
    await lc.start();
    expect((await lc.health.startup()).status).toBe('healthy');
    expect((await lc.health.readiness()).status).toBe('degraded');
    lc.health.markDraining();
    expect((await lc.health.readiness()).status).toBe('unhealthy');
  });
});

describe('ShutdownManager', () => {
  it('is idempotent and reports failures', async () => {
    const sm = new ShutdownManager();
    let calls = 0;
    sm.register({ name: 'a', priority: 1, fn: async () => void calls++ });
    sm.register({ name: 'b', priority: 2, fn: async () => { throw new Error('boom'); } });
    const [r1, r2] = await Promise.all([sm.runAll(logger), sm.runAll(logger)]);
    expect(calls).toBe(1);
    expect(r1).toBe(false);
    expect(r2).toBe(false);
  });

  it('signal handler exits non-zero on failure and forces exit on second signal', async () => {
    const sm = new ShutdownManager();
    sm.register({ name: 'bad', priority: 1, fn: async () => { throw new Error('x'); } });
    const exit = vi.fn();
    const remove = sm.installSignalHandlers(logger, { signals: ['SIGUSR2'], exit });
    process.emit('SIGUSR2', 'SIGUSR2');
    process.emit('SIGUSR2', 'SIGUSR2');
    await new Promise((r) => setTimeout(r, 10));
    expect(exit).toHaveBeenCalledWith(1);
    expect(exit.mock.calls[0][0]).toBe(1);
    remove();
  });
});

describe('bootstrapForTest', () => {
  it('registers observability keys in an isolated container', () => {
    const before = getContainer();
    const app = bootstrapForTest();
    expect(getContainer()).not.toBe(before);
    expect(app.container.has(KEYS.Tracer)).toBe(true);
    expect(app.container.has(KEYS.Metrics)).toBe(true);
    expect(app.container.resolve(KEYS.Logger)).toBe(app.logger);
    app.restore();
    expect(getContainer()).toBe(before);
  });
});
