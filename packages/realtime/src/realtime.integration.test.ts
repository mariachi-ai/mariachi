import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createContext, type Logger } from '@mariachi/core';
import { startRedis, stopAll } from '../../../test/setup';
import { CLOSE_CODES, DefaultRealtime, WSAdapter, createRealtimeInfra, type ConnectionIdentity, type ServerMessage } from './index';

const logger: Logger = { info() {}, warn() {}, error() {}, debug() {}, child: () => logger };
const users: Record<string, ConnectionIdentity> = {
  'tok-alice': { userId: 'alice', tenantId: 't1' },
  'tok-bob': { userId: 'bob', tenantId: 't1' },
};

interface Client {
  ws: WebSocket;
  inbox: ServerMessage[];
  next(pred: (m: ServerMessage) => boolean, timeoutMs?: number): Promise<ServerMessage>;
  closed: Promise<{ code: number }>;
}

function client(port: number, token?: string, headers: Record<string, string> = {}): Promise<Client> {
  const url = `ws://127.0.0.1:${port}/ws${token ? `?token=${token}` : ''}`;
  const ws = new WebSocket(url, { headers });
  const inbox: ServerMessage[] = [];
  const waiters: Array<{ pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }> = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString()) as ServerMessage;
    inbox.push(m);
    for (const w of [...waiters]) {
      if (!w.pred(m)) continue;
      waiters.splice(waiters.indexOf(w), 1);
      w.resolve(m);
    }
  });
  const closed = new Promise<{ code: number }>((resolve) => ws.on('close', (code) => resolve({ code })));
  const next = (pred: (m: ServerMessage) => boolean, timeoutMs = 5_000) =>
    new Promise<ServerMessage>((resolve, reject) => {
      const found = inbox.find(pred);
      if (found) return resolve(found);
      waiters.push({ pred, resolve });
      setTimeout(() => reject(new Error('timed out waiting for message')), timeoutMs);
    });
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve({ ws, inbox, next, closed }));
    ws.once('unexpected-response', (_req, res) => reject(Object.assign(new Error('rejected'), { status: res.statusCode })));
    ws.once('error', reject);
  });
}

let redisUrl: string;
const nodes: WSAdapter[] = [];

async function node(prefix: string, config = {}) {
  const realtime = new DefaultRealtime({ ...createRealtimeInfra({ adapter: 'redis', url: redisUrl, prefix }), config }, { logger });
  const ws = new WSAdapter(realtime, { port: 0, authenticate: async (token) => (token ? (users[token] ?? null) : null), allowedOrigins: undefined }, { logger });
  await ws.connect();
  nodes.push(ws);
  return { realtime, port: ws.address()!.port, ws };
}

beforeAll(async () => {
  redisUrl = await startRedis();
});

afterAll(async () => {
  await Promise.all(nodes.map((n) => n.disconnect().catch(() => undefined)));
  await stopAll();
});

describe('realtime over redis + websockets', () => {
  it('rejects unauthenticated upgrades with 401', async () => {
    const { port } = await node('rt-auth');
    await expect(client(port)).rejects.toMatchObject({ status: 401 });
    await expect(client(port, 'bogus')).rejects.toMatchObject({ status: 401 });
  });

  it('fans out broadcasts and direct messages across instances, with shared presence', async () => {
    const prefix = 'rt-fanout';
    const A = await node(prefix);
    const B = await node(prefix);
    const alice = await client(A.port, 'tok-alice');
    const bob = await client(B.port, 'tok-bob');
    await alice.next((m) => m.type === 'welcome');
    await bob.next((m) => m.type === 'welcome');

    alice.ws.send(JSON.stringify({ type: 'subscribe', channel: 'tenant:t1:room' }));
    await alice.next((m) => m.type === 'subscribed');

    await B.realtime.broadcast(createContext({ logger, tenantId: 't1' }), 'tenant:t1:room', { from: 'B' });
    expect(await alice.next((m) => m.type === 'message')).toEqual({ type: 'message', channel: 'tenant:t1:room', data: { from: 'B' } });

    await A.realtime.sendToUser(createContext({ logger, tenantId: 't1' }), 'bob', { dm: true });
    expect(await bob.next((m) => m.type === 'message')).toMatchObject({ data: { dm: true } });

    const t1 = createContext({ logger, tenantId: 't1' });
    expect((await A.realtime.getOnlineUsers(t1)).sort()).toEqual(['alice', 'bob']);

    bob.ws.close();
    await bob.closed;
    await new Promise((r) => setTimeout(r, 100));
    expect(await A.realtime.getOnlineUsers(t1)).toEqual(['alice']);
    alice.ws.close();
  });

  it('limits connections per user cluster-wide', async () => {
    const prefix = 'rt-limit';
    const A = await node(prefix, { maxConnectionsPerUser: 1 });
    const B = await node(prefix, { maxConnectionsPerUser: 1 });
    const first = await client(A.port, 'tok-alice');
    await first.next((m) => m.type === 'welcome');
    const second = await client(B.port, 'tok-alice');
    expect((await second.closed).code).toBe(CLOSE_CODES.tooManyConnections);
    first.ws.close();
  });

  it('enforces origin allow-lists', async () => {
    const realtime = new DefaultRealtime({}, { logger });
    const ws = new WSAdapter(realtime, { port: 0, allowedOrigins: ['https://app.example.com'], authenticate: async () => users['tok-alice']! }, { logger });
    await ws.connect();
    nodes.push(ws);
    const port = ws.address()!.port;
    await expect(client(port, 'tok-alice', { Origin: 'https://evil.example.com' })).rejects.toMatchObject({ status: 403 });
    const ok = await client(port, 'tok-alice', { Origin: 'https://app.example.com' });
    await ok.next((m) => m.type === 'welcome');
    ok.ws.close();
  });
});
