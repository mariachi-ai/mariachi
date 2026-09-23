import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createContext, currentContext, MariachiError, type Context, type Logger } from '@mariachi/core';
import { DefaultEvents, MemoryDeadLetterSink, MemoryEventBus, createEventBus, decodeEnvelope, defineEvent, type EventMeta } from './index';

const logger: Logger = { info() {}, warn() {}, error() {}, debug() {}, child: () => logger };
const ctx = (over: Partial<Context> = {}) => createContext({ logger, traceId: 'trace-1', tenantId: 't1', userId: 'u1', identityType: 'user', ...over });

function setup() {
  const bus = new MemoryEventBus();
  const deadLetter = new MemoryDeadLetterSink();
  const events = new DefaultEvents({ bus, deadLetter, source: 'svc', retry: { attempts: 3, baseDelayMs: 1, jitter: false } }, { logger });
  return { bus, deadLetter, events };
}

describe('Events', () => {
  it('carries context on the envelope, not in the payload, and rebuilds it for subscribers', async () => {
    const { bus, events } = setup();
    let seen: { ctx: Context; payload: unknown; meta: EventMeta; ambient?: Context } | undefined;
    events.subscribe('user.created', async (c, payload, meta) => {
      seen = { ctx: c, payload, meta, ambient: currentContext() };
    });
    const envelope = await events.publish(ctx(), 'user.created', { id: 'x' });

    expect(bus.published[0]).toMatchObject({ type: 'user.created', traceId: 'trace-1', tenantId: 't1', userId: 'u1', source: 'svc' });
    expect(seen!.payload).toEqual({ id: 'x' });
    expect(seen!.ctx).toMatchObject({ traceId: 'trace-1', tenantId: 't1', userId: 'u1', identityType: 'user' });
    expect(seen!.ambient?.traceId).toBe('trace-1');
    expect(seen!.meta).toMatchObject({ id: envelope.id, type: 'user.created', attempt: 1, source: 'svc' });
  });

  it('validates payloads with defineEvent schemas on publish and on receipt', async () => {
    const { bus, events, deadLetter } = setup();
    const Created = defineEvent('order.created', { schema: z.object({ orderId: z.string() }) });
    await expect(events.publish(ctx(), Created, { orderId: 1 } as never)).rejects.toMatchObject({ code: 'validation/invalid-input' });
    expect(bus.published).toHaveLength(0);

    let calls = 0;
    events.subscribe(Created, async () => {
      calls++;
    });
    await bus.publish({ ...decodeEnvelope(JSON.stringify({ id: 'e1', type: 'order.created', traceId: 't' })), payload: { wrong: true } });
    expect(calls).toBe(0);
    expect(deadLetter.entries[0]).toMatchObject({ attempts: 1, error: { code: 'validation/invalid-input' } });
  });

  it('retries failing handlers, then dead-letters instead of swallowing the error', async () => {
    const { events, deadLetter } = setup();
    let attempts = 0;
    events.subscribe('flaky', async () => {
      attempts++;
      if (attempts < 2) throw new MariachiError('x/transient', 'boom');
    });
    await events.publish(ctx(), 'flaky', {});
    expect(attempts).toBe(2);
    expect(deadLetter.entries).toHaveLength(0);

    events.subscribe(
      'broken',
      async () => {
        throw new MariachiError('x/always', 'nope');
      },
      { name: 'brokenHandler' },
    );
    await events.publish(ctx(), 'broken', { a: 1 });
    expect(deadLetter.entries[0]).toMatchObject({
      subscriber: 'fanout:broken:brokenHandler',
      attempts: 3,
      error: { code: 'x/always', message: 'nope' },
      envelope: { type: 'broken', payload: { a: 1 }, tenantId: 't1' },
    });
  });

  it('skips retries for non-retryable codes', async () => {
    const { events, deadLetter } = setup();
    let attempts = 0;
    events.subscribe(
      'poison',
      async () => {
        attempts++;
        throw new MariachiError('orders/invalid-state', 'bad');
      },
      { nonRetryableCodes: ['orders/invalid-state'] },
    );
    await events.publish(ctx(), 'poison', {});
    expect(attempts).toBe(1);
    expect(deadLetter.entries[0]?.attempts).toBe(1);
  });

  it('delivers to one member per group and to every ungrouped subscriber', async () => {
    const { events } = setup();
    const hits: string[] = [];
    events.subscribe('job', async () => void hits.push('a1'), { group: 'a' });
    events.subscribe('job', async () => void hits.push('a2'), { group: 'a' });
    events.subscribe('job', async () => void hits.push('b1'), { group: 'b' });
    events.subscribe('job', async () => void hits.push('fan'));
    await events.publish(ctx(), 'job', {});
    await events.publish(ctx(), 'job', {});
    expect(hits.filter((h) => h.startsWith('a')).sort()).toEqual(['a1', 'a2']);
    expect(hits.filter((h) => h === 'b1')).toHaveLength(2);
    expect(hits.filter((h) => h === 'fan')).toHaveLength(2);
  });

  it('unsubscribes', async () => {
    const { events } = setup();
    let n = 0;
    const sub = events.subscribe('e', async () => void n++);
    await events.publish(ctx(), 'e', {});
    await sub.unsubscribe();
    await events.publish(ctx(), 'e', {});
    expect(n).toBe(1);
  });

  it('rejects malformed wire messages and unknown adapters', () => {
    expect(() => decodeEnvelope('not json')).toThrow(expect.objectContaining({ code: 'events/malformed' }));
    expect(() => decodeEnvelope('{"payload":1}')).toThrow(expect.objectContaining({ code: 'events/malformed' }));
    expect(() => createEventBus({ adapter: 'kafka' } as never)).toThrow(expect.objectContaining({ code: 'events/unknown-adapter' }));
  });
});
