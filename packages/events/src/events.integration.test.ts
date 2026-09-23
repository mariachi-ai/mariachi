import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Redis from 'ioredis';
import { sql } from 'drizzle-orm';
import { createContext, type Logger } from '@mariachi/core';
import { applySchema, createPostgresDatabase, withTransaction, type PostgresDatabase } from '@mariachi/database-postgres';
import { startNats, startPostgres, startRedis, stopAll } from '../../../test/setup';
import { DefaultEvents, MemoryDeadLetterSink, MemoryEventBus, createEventBus, createEnvelope, type EventBus, type EventEnvelope } from './index';
import { Outbox, OutboxRelay, eventOutboxTable } from './outbox/index';

const logger: Logger = { info() {}, warn() {}, error() {}, debug() {}, child: () => logger };
const ctx = createContext({ logger, traceId: 'trace-int', tenantId: 't1', identityType: 'user' });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(check: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for condition');
    await sleep(25);
  }
}

let redisUrl: string;
let natsUrl: string;
let pgUrl: string;
const open: EventBus[] = [];
const track = <T extends EventBus>(bus: T) => {
  open.push(bus);
  return bus;
};
const prefix = () => `it${Math.random().toString(36).slice(2, 8)}`;

beforeAll(async () => {
  [redisUrl, natsUrl, pgUrl] = await Promise.all([startRedis(), startNats(), startPostgres()]);
});

afterAll(async () => {
  await Promise.all(open.map((b) => b.disconnect().catch(() => undefined)));
  await stopAll();
});

describe('redis pub/sub', () => {
  it('activates subscriptions registered before connect', async () => {
    const bus = track(createEventBus({ adapter: 'redis', url: redisUrl, prefix: prefix() }));
    const events = new DefaultEvents({ bus }, { logger });
    const got: unknown[] = [];
    events.subscribe('ping', async (c, p) => void got.push({ p, trace: c.traceId }));
    await events.connect();
    await events.publish(ctx, 'ping', { n: 1 });
    await waitFor(() => got.length === 1);
    expect(got[0]).toEqual({ p: { n: 1 }, trace: 'trace-int' });
  });
});

describe('redis streams', () => {
  it('shares events within a group, fans out across groups, and survives subscriber downtime', async () => {
    const p = prefix();
    const mk = () => track(createEventBus({ adapter: 'redis-streams', url: redisUrl, prefix: p, blockMs: 100 }));
    const a1 = mk();
    const a2 = mk();
    const b = mk();
    const hits = { a1: [] as string[], a2: [] as string[], b: [] as string[] };
    const subA1 = a1.subscribe('order', async (e) => void hits.a1.push(e.id), { group: 'a' });
    const subA2 = a2.subscribe('order', async (e) => void hits.a2.push(e.id), { group: 'a' });
    const subB = b.subscribe('order', async (e) => void hits.b.push(e.id), { group: 'b' });
    await Promise.all([a1.connect(), a2.connect(), b.connect()]);
    await Promise.all([subA1.ready, subA2.ready, subB.ready]);

    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      const env = createEnvelope(ctx, 'order', { i });
      ids.push(env.id);
      await a1.publish(env);
    }
    await waitFor(() => hits.a1.length + hits.a2.length === 20 && hits.b.length === 20);
    expect(new Set([...hits.a1, ...hits.a2])).toEqual(new Set(ids));
    expect(hits.b.sort()).toEqual([...ids].sort());

    await b.disconnect();
    const offline = createEnvelope(ctx, 'order', { offline: true });
    await a1.publish(offline);
    const b2 = mk();
    const late: string[] = [];
    b2.subscribe('order', async (e) => void late.push(e.id), { group: 'b' });
    await b2.connect();
    await waitFor(() => late.includes(offline.id));
  });

  it('redelivers unacknowledged entries and dead-letters after maxDeliveries', async () => {
    const p = prefix();
    const bus = track(
      createEventBus({ adapter: 'redis-streams', url: redisUrl, prefix: p, blockMs: 100, claimIdleMs: 300, maxDeliveries: 3 }),
    );
    const attempts: number[] = [];
    const sub = bus.subscribe('fragile', async (_e, d) => {
      attempts.push(d.attempt);
      throw new Error('crash');
    });
    await bus.connect();
    await sub.ready;
    await bus.publish(createEnvelope(ctx, 'fragile', { x: 1 }));
    await waitFor(() => attempts.length >= 3, 15_000);
    expect(attempts.slice(0, 3)).toEqual([1, 2, 3]);

    const redis = new Redis(redisUrl);
    try {
      let entries: [string, string[]][] = [];
      const deadline = Date.now() + 10_000;
      while (entries.length === 0 && Date.now() < deadline) {
        entries = (await redis.xrange(`${p}:dead-letter`, '-', '+')) as [string, string[]][];
        await sleep(100);
      }
      const dl = JSON.parse(entries[0]![1][1]!);
      expect(dl).toMatchObject({ error: { code: 'events/max-deliveries' }, envelope: { type: 'fragile', payload: { x: 1 } } });
    } finally {
      redis.disconnect();
    }
  });

  it('runs Events handlers with at-least-once delivery end to end', async () => {
    const bus = track(createEventBus({ adapter: 'redis-streams', url: redisUrl, prefix: prefix(), blockMs: 100 }));
    const deadLetter = new MemoryDeadLetterSink();
    const events = new DefaultEvents({ bus, deadLetter, retry: { attempts: 1 } }, { logger });
    const seen: string[] = [];
    const sub = events.subscribe('invoice.paid', async (c) => void seen.push(c.tenantId ?? ''), { group: 'billing' });
    await events.connect();
    await sub.ready;
    await events.publish(ctx, 'invoice.paid', {});
    await waitFor(() => seen.length === 1);
    expect(seen).toEqual(['t1']);
    expect(events.guarantee).toBe('at-least-once');
  });
});

describe('nats', () => {
  it('core: queue groups share events and pre-connect subscriptions activate', async () => {
    const p = prefix();
    const x = track(createEventBus({ adapter: 'nats', url: natsUrl, prefix: p }));
    const y = track(createEventBus({ adapter: 'nats', url: natsUrl, prefix: p }));
    let xs = 0;
    let ys = 0;
    x.subscribe('tick', async () => void xs++, { group: 'g' });
    y.subscribe('tick', async () => void ys++, { group: 'g' });
    await x.connect();
    await y.connect();
    await sleep(100);
    for (let i = 0; i < 10; i++) await x.publish(createEnvelope(ctx, 'tick', { i }));
    await waitFor(() => xs + ys === 10);
    await sleep(200);
    expect(xs + ys).toBe(10);
  });

  it('jetstream: durable groups redeliver, ephemeral subscribers only see new events', async () => {
    const p = prefix();
    const stream = `S_${p}`;
    const bus = track(createEventBus({ adapter: 'nats-jetstream', url: natsUrl, prefix: p, stream, ackWaitMs: 1_000 }));
    await bus.connect();
    await bus.publish(createEnvelope(ctx, 'evt', { old: true }));

    const durable: number[] = [];
    const d = bus.subscribe(
      'evt',
      async (e, info) => {
        if ((e.payload as { old?: boolean }).old) return;
        durable.push(info.attempt);
        if (info.attempt === 1) throw new Error('first try fails');
      },
      { group: 'workers' },
    );
    const ephemeral: EventEnvelope[] = [];
    const eph = bus.subscribe('evt', async (e) => void ephemeral.push(e));
    await Promise.all([d.ready, eph.ready]);

    await bus.publish(createEnvelope(ctx, 'evt', { fresh: true }));
    await waitFor(() => durable.length >= 2 && ephemeral.length >= 1, 15_000);
    expect(durable.slice(0, 2)).toEqual([1, 2]);
    expect(ephemeral.map((e) => e.payload)).toEqual([{ fresh: true }]);
  });
});

describe('outbox', () => {
  let database: PostgresDatabase;

  beforeAll(async () => {
    database = createPostgresDatabase({ url: pgUrl });
    await database.connect();
    await applySchema(database.db, [eventOutboxTable]);
  });

  afterAll(async () => {
    await database?.disconnect();
  });

  it('only relays events from committed transactions, once', async () => {
    const db = database.db;
    const outbox = new Outbox(db);
    const bus = new MemoryEventBus();
    const relay = new OutboxRelay({ db, target: bus, logger });

    await expect(outbox.add(ctx, 'x', {})).rejects.toMatchObject({ code: 'events/outbox-requires-transaction' });

    const committed = await withTransaction(db, ctx, () => outbox.add(ctx, 'account.opened', { id: 'a1' }));
    await expect(
      withTransaction(db, ctx, async () => {
        await outbox.add(ctx, 'account.opened', { id: 'rolled-back' });
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');

    expect(await relay.relayOnce()).toBe(1);
    expect(await relay.relayOnce()).toBe(0);
    expect(bus.published).toHaveLength(1);
    expect(bus.published[0]).toMatchObject({ id: committed.id, type: 'account.opened', payload: { id: 'a1' }, tenantId: 't1', traceId: 'trace-int' });
  });

  it('backs off rows whose publish fails and keeps them pending', async () => {
    const db = database.db;
    const outbox = new Outbox(db);
    let fail = true;
    const published: EventEnvelope[] = [];
    const relay = new OutboxRelay({
      db,
      logger,
      target: {
        publish: async (e: EventEnvelope) => {
          if (fail) throw new Error('broker down');
          published.push(e);
        },
      },
    });
    const env = await withTransaction(db, ctx, () => outbox.add(ctx, 'retry.me', {}));
    expect(await relay.relayOnce()).toBe(0);
    const [row] = (await db.execute(
      sql`select attempts, last_error, available_at > now() as delayed, published_at from mariachi_event_outbox where id = ${env.id}`,
    )) as unknown as Array<{ attempts: number; last_error: string; delayed: boolean; published_at: Date | null }>;
    expect(row).toMatchObject({ attempts: 1, last_error: 'broker down', delayed: true, published_at: null });

    fail = false;
    await db.execute(sql`update mariachi_event_outbox set available_at = now() where id = ${env.id}`);
    expect(await relay.relayOnce()).toBe(1);
    expect(published.map((e) => e.id)).toEqual([env.id]);
  });

  it('relays in the background and stops cleanly', async () => {
    const db = database.db;
    const outbox = new Outbox(db);
    const bus = new MemoryEventBus();
    const relay = new OutboxRelay({ db, target: bus, logger, intervalMs: 50 });
    await relay.connect();
    await withTransaction(db, ctx, () => outbox.add(ctx, 'bg.event', {}));
    await waitFor(() => bus.published.some((e) => e.type === 'bg.event'));
    await relay.disconnect();
    expect(await relay.isHealthy()).toBe(false);
  });
});
