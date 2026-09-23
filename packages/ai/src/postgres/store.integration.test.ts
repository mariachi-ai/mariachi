import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { applySchema, createPostgresDatabase, type PostgresDatabase } from '@mariachi/database-postgres';
import { startPostgres, stopAll } from '../../../../test/setup';
import { aiMessagesTable, aiSessionsTable, aiTelemetryTable } from '../schema/index';
import { SessionManager } from '../session/manager';
import type { AIResponse } from '../types';
import { DrizzleAISessionStore } from './index';

let database: PostgresDatabase;
let store: DrizzleAISessionStore;
const run = crypto.randomUUID().slice(0, 8);

const reply = (n: number): AIResponse => ({
  content: `reply ${n}`,
  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  model: 'test',
  latencyMs: 1,
});

beforeAll(async () => {
  database = createPostgresDatabase({ url: await startPostgres() });
  await database.connect();
  await applySchema(database.db, [aiSessionsTable, aiMessagesTable, aiTelemetryTable]);
  store = new DrizzleAISessionStore(database.db);
}, 180_000);

afterAll(async () => {
  await database?.disconnect();
  await stopAll();
});

describe('DrizzleAISessionStore', () => {
  it('restores history in order and usage after a restart', async () => {
    let n = 0;
    const adapter = { generate: async () => reply(++n) };
    const id = `chat-${run}`;
    const first = new SessionManager(adapter, store);
    const session = await first.createPersisted(id, { model: 'test', systemPrompt: 'be brief', tenantId: 't1', userId: 'u1' });
    await session.send('one');
    await session.send('two');

    const restarted = new SessionManager(adapter, store);
    expect(restarted.get(id)).toBeUndefined();
    const reopened = await restarted.open(id);
    expect(reopened?.getHistory().map((m) => m.content)).toEqual(['be brief', 'one', 'reply 1', 'two', 'reply 2']);
    expect(reopened?.usage?.().totalTokens).toBe(30);

    await reopened!.send('three');
    const rows = await database.db.execute(sql`select position from ai_messages where session_id = ${id} order by position`);
    expect([...rows].map((r) => Number(r.position))).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('records telemetry', async () => {
    await store.recordTelemetry({ sessionId: `chat-${run}`, tenantId: 't1', model: 'test', inputTokens: 1, outputTokens: 2, latencyMs: 3.4, costUsd: 0.000123, createdAt: new Date() });
    const rows = await database.db.execute(sql`select cost_usd from ai_telemetry where session_id = ${`chat-${run}`}`);
    expect(Number([...rows][0]?.cost_usd)).toBeCloseTo(0.000123);
  });
});
