import { describe, expect, it } from 'vitest';
import { createContext, type Logger } from '@mariachi/core';
import {
  CLOSE_CODES,
  DefaultRealtime,
  MemoryBackplane,
  MemoryBackplaneHub,
  MemoryPresenceStore,
  defaultChannelAuthorizer,
  type ConnectionIdentity,
  type RealtimeConfig,
  type RealtimeSocket,
  type ServerMessage,
} from './index';

const logger: Logger = { info() {}, warn() {}, error() {}, debug() {}, child: () => logger };
const ctx = (tenantId: string | null) => createContext({ logger, tenantId });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class FakeSocket implements RealtimeSocket {
  sent: ServerMessage[] = [];
  closed?: { code: number; reason: string };
  pings = 0;
  constructor(private readonly withPing = false) {
    if (!withPing) this.ping = undefined;
  }
  send(m: ServerMessage) {
    this.sent.push(m);
  }
  ping?: () => void = () => {
    this.pings++;
  };
  close(code: number, reason: string) {
    this.closed = { code, reason };
  }
  messages() {
    return this.sent.filter((m) => m.type === 'message');
  }
  last() {
    return this.sent[this.sent.length - 1];
  }
}

function cluster(config: RealtimeConfig = {}) {
  const hub = new MemoryBackplaneHub();
  const presence = new MemoryPresenceStore();
  const make = () => new DefaultRealtime({ backplane: new MemoryBackplane(hub), presence, config }, { logger });
  return { a: make(), b: make(), presence };
}

const alice: ConnectionIdentity = { userId: 'alice', tenantId: 't1' };
const bob: ConnectionIdentity = { userId: 'bob', tenantId: 't1' };
const mallory: ConnectionIdentity = { userId: 'alice', tenantId: 't2' };

describe('defaultChannelAuthorizer', () => {
  it('scopes channels to tenant and user, denies everything else', () => {
    const allow = (id: ConnectionIdentity, ch: string, action: 'subscribe' | 'publish' = 'subscribe') => defaultChannelAuthorizer(id, ch, action);
    expect(allow(alice, 'tenant:t1')).toBe(true);
    expect(allow(alice, 'tenant:t1:chat:general')).toBe(true);
    expect(allow(alice, 'tenant:t2:chat:general')).toBe(false);
    expect(allow(alice, 'user:alice')).toBe(true);
    expect(allow(alice, 'user:bob')).toBe(false);
    expect(allow(alice, 'tenant:t1:user:alice:inbox')).toBe(true);
    expect(allow(alice, 'tenant:t1:user:bob')).toBe(false);
    expect(allow(alice, 'public:status')).toBe(true);
    expect(allow(alice, 'public:status', 'publish')).toBe(false);
    expect(allow(alice, 'admin')).toBe(false);
    expect(allow({ userId: 'x', tenantId: null }, 'tenant:null')).toBe(false);
  });
});

describe('Realtime', () => {
  it('broadcasts across instances to channel subscribers only', async () => {
    const { a, b } = cluster();
    await a.connect();
    await b.connect();
    const sa = new FakeSocket();
    const sb = new FakeSocket();
    const other = new FakeSocket();
    const ida = (await a.handleConnect(alice, sa))!;
    const idb = (await b.handleConnect(bob, sb))!;
    await b.handleConnect(bob, other);
    await a.handleMessage(ida, JSON.stringify({ type: 'subscribe', channel: 'tenant:t1:room', id: 'r1' }));
    await b.subscribe(idb, 'tenant:t1:room');
    expect(sa.last()).toEqual({ type: 'subscribed', channel: 'tenant:t1:room', id: 'r1' });

    await b.broadcast(ctx('t1'), 'tenant:t1:room', { hello: 1 });
    expect(sa.messages()).toEqual([{ type: 'message', channel: 'tenant:t1:room', data: { hello: 1 } }]);
    expect(sb.messages()).toHaveLength(1);
    expect(other.messages()).toHaveLength(0);
  });

  it('sendToUser is tenant-scoped and reaches every instance', async () => {
    const { a, b } = cluster();
    await a.connect();
    await b.connect();
    const s1 = new FakeSocket();
    const s2 = new FakeSocket();
    const s3 = new FakeSocket();
    await a.handleConnect(alice, s1);
    await b.handleConnect(alice, s2);
    await b.handleConnect(mallory, s3);
    await a.sendToUser(ctx('t1'), 'alice', { n: 1 });
    expect(s1.messages()).toHaveLength(1);
    expect(s2.messages()).toHaveLength(1);
    expect(s3.messages()).toHaveLength(0);
    expect(await a.getOnlineUsers(ctx('t1'))).toEqual(['alice']);
    expect(await a.isUserOnline(ctx('t2'), 'alice')).toBe(true);
    expect(await a.isUserOnline(ctx('t3'), 'alice')).toBe(false);
  });

  it('denies unauthorized subscriptions', async () => {
    const { a } = cluster();
    await a.connect();
    const s = new FakeSocket();
    const id = (await a.handleConnect(alice, s))!;
    expect(await a.subscribe(id, 'tenant:t2:secrets')).toBe(false);
    expect(s.last()).toMatchObject({ type: 'error', code: 'realtime/forbidden' });
    await a.broadcast(ctx('t2'), 'tenant:t2:secrets', {});
    expect(s.messages()).toHaveLength(0);
  });

  it('enforces maxConnectionsPerUser across instances', async () => {
    const { a, b } = cluster({ maxConnectionsPerUser: 2 });
    await a.connect();
    await b.connect();
    expect(await a.handleConnect(alice, new FakeSocket())).toBeTruthy();
    const second = (await b.handleConnect(alice, new FakeSocket()))!;
    const third = new FakeSocket();
    expect(await b.handleConnect(alice, third)).toBeNull();
    expect(third.closed?.code).toBe(CLOSE_CODES.tooManyConnections);
    expect(await a.handleConnect(bob, new FakeSocket())).toBeTruthy();

    await b.handleDisconnect(second);
    expect(await b.handleConnect(alice, new FakeSocket())).toBeTruthy();
  });

  it('terminates connections that stop answering heartbeats', async () => {
    const { a, presence } = cluster({ heartbeatIntervalMs: 20 });
    await a.connect();
    const dead = new FakeSocket(true);
    const live = new FakeSocket(true);
    await a.handleConnect(alice, dead);
    const liveId = (await a.handleConnect(bob, live))!;
    const keepAlive = setInterval(() => a.markAlive(liveId), 5);
    await sleep(120);
    clearInterval(keepAlive);
    expect(dead.pings).toBeGreaterThan(0);
    expect(dead.closed?.code).toBe(CLOSE_CODES.heartbeatTimeout);
    expect(live.closed).toBeUndefined();
    expect(await presence.onlineUsers('t1')).toEqual(['bob']);
    await a.disconnect();
  });

  it('client publish is off by default, and when on is authorized and excludes the sender', async () => {
    const off = cluster();
    await off.a.connect();
    const s = new FakeSocket();
    const id = (await off.a.handleConnect(alice, s))!;
    await off.a.handleMessage(id, { type: 'publish', channel: 'tenant:t1:room', data: 1 });
    expect(s.last()).toMatchObject({ type: 'error', code: 'realtime/publish-disabled' });

    const { a, b } = cluster({ allowClientPublish: true });
    await a.connect();
    await b.connect();
    const sender = new FakeSocket();
    const receiver = new FakeSocket();
    const sid = (await a.handleConnect(alice, sender))!;
    const rid = (await b.handleConnect(bob, receiver))!;
    await a.subscribe(sid, 'tenant:t1:room');
    await b.subscribe(rid, 'tenant:t1:room');
    await a.handleMessage(sid, { type: 'publish', channel: 'tenant:t1:room', data: { text: 'hi' }, id: 'p1' });
    expect(receiver.messages()).toEqual([{ type: 'message', channel: 'tenant:t1:room', data: { text: 'hi' }, from: 'alice' }]);
    expect(sender.messages()).toHaveLength(0);
    expect(sender.last()).toEqual({ type: 'published', channel: 'tenant:t1:room', id: 'p1' });

    await a.handleMessage(sid, { type: 'publish', channel: 'public:news', data: 1 });
    expect(sender.last()).toMatchObject({ type: 'error', code: 'realtime/forbidden' });
  });

  it('rejects malformed frames and answers pings', async () => {
    const { a } = cluster();
    await a.connect();
    const s = new FakeSocket();
    const id = (await a.handleConnect(alice, s))!;
    await a.handleMessage(id, 'not json');
    expect(s.last()).toMatchObject({ type: 'error', code: 'realtime/invalid-message' });
    await a.handleMessage(id, { type: 'explode' });
    expect(s.last()).toMatchObject({ type: 'error', code: 'realtime/invalid-message' });
    await a.handleMessage(id, { type: 'ping', id: 'x' });
    expect(s.last()).toEqual({ type: 'pong', id: 'x' });
  });

  it('closes connections with 1001 and clears presence on shutdown', async () => {
    const { a, presence } = cluster();
    await a.connect();
    const s = new FakeSocket();
    await a.handleConnect(alice, s);
    await a.disconnect();
    expect(s.closed?.code).toBe(CLOSE_CODES.goingAway);
    expect(await presence.onlineUsers('t1')).toEqual([]);
    expect(a.localConnectionCount).toBe(0);
  });
});
