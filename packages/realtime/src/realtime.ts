import { randomUUID } from 'node:crypto';
import type { Context, Disposable, Instrumentable, Logger, MetricsAdapter, TracerAdapter } from '@mariachi/core';
import { RealtimeError, resolveInstrumentation, withSpan, type InstrumentationDeps } from '@mariachi/core';
import { defaultChannelAuthorizer } from './authorize';
import { MemoryBackplane, MemoryPresenceStore } from './adapters/memory';
import {
  clientMessageSchema,
  type Backplane,
  type BackplaneMessage,
  type BackplaneTarget,
  type ChannelAuthorizer,
  type ConnectionIdentity,
  type ConnectionInfo,
  type PresenceEntry,
  type PresenceStore,
  type RealtimeConfig,
  type RealtimeSocket,
  type ServerMessage,
} from './types';

export interface RealtimeDeps {
  /** Cross-instance fan-out. Default in-process (single instance only). */
  backplane?: Backplane;
  /** Cross-instance presence. Default in-process. */
  presence?: PresenceStore;
  /** Channel policy. Default `defaultChannelAuthorizer` (deny unless the channel is scoped to the caller). */
  authorize?: ChannelAuthorizer;
  config?: RealtimeConfig;
}

interface LocalConnection {
  info: ConnectionInfo;
  socket: RealtimeSocket;
  alive: boolean;
}

/** WebSocket close codes used by the realtime layer. */
export const CLOSE_CODES = {
  goingAway: 1001,
  heartbeatTimeout: 4000,
  unauthorized: 4001,
  forbidden: 4003,
  tooManyConnections: 4008,
} as const;

export abstract class Realtime implements Instrumentable, Disposable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  readonly instanceId: string;
  protected readonly backplane: Backplane;
  protected readonly presence: PresenceStore;
  protected readonly authorize: ChannelAuthorizer;
  protected readonly config: Required<Omit<RealtimeConfig, 'maxConnectionsPerUser' | 'instanceId'>> & { maxConnectionsPerUser?: number };
  private readonly connections = new Map<string, LocalConnection>();
  private heartbeatTimer?: NodeJS.Timeout;
  private started = false;

  constructor(deps: RealtimeDeps = {}, instrumentation?: InstrumentationDeps) {
    const resolved = resolveInstrumentation(instrumentation);
    this.logger = resolved.logger;
    this.tracer = resolved.tracer;
    this.metrics = resolved.metrics;
    this.backplane = deps.backplane ?? new MemoryBackplane();
    this.presence = deps.presence ?? new MemoryPresenceStore();
    this.authorize = deps.authorize ?? defaultChannelAuthorizer;
    const c = deps.config ?? {};
    const heartbeatIntervalMs = c.heartbeatIntervalMs ?? 30_000;
    this.instanceId = c.instanceId ?? randomUUID();
    this.config = {
      heartbeatIntervalMs,
      connectionTtlMs: c.connectionTtlMs ?? heartbeatIntervalMs * 3,
      maxConnectionsPerUser: c.maxConnectionsPerUser,
      maxChannelsPerConnection: c.maxChannelsPerConnection ?? 100,
      allowClientPublish: c.allowClientPublish ?? false,
    };
  }

  get localConnectionCount(): number {
    return this.connections.size;
  }

  private entry(conn: LocalConnection): PresenceEntry {
    return {
      connectionId: conn.info.connectionId,
      userId: conn.info.identity.userId,
      tenantId: conn.info.identity.tenantId,
      instanceId: this.instanceId,
    };
  }

  /**
   * Registers an authenticated socket. Returns the connection id, or null if the connection was
   * rejected (it has already been closed with an explanatory code).
   */
  async handleConnect(identity: ConnectionIdentity, socket: RealtimeSocket, connectionId: string = randomUUID()): Promise<string | null> {
    return withSpan(this.tracer, 'realtime.connect', { connectionId, userId: identity.userId }, async () => {
      const conn: LocalConnection = {
        info: { connectionId, identity, channels: new Set(), connectedAt: new Date() },
        socket,
        alive: true,
      };
      const count = await this.presence.add(this.entry(conn), this.config.connectionTtlMs);
      const max = this.config.maxConnectionsPerUser;
      if (max !== undefined && count > max) {
        await this.presence.remove(this.entry(conn));
        this.metrics?.increment('realtime.connections.rejected', 1, { reason: 'limit' });
        socket.send({ type: 'error', code: 'realtime/too-many-connections', message: `At most ${max} connections per user` });
        socket.close(CLOSE_CODES.tooManyConnections, 'Too many connections');
        return null;
      }
      this.connections.set(connectionId, conn);
      this.metrics?.increment('realtime.connections.opened', 1);
      this.metrics?.gauge('realtime.connections.active', this.connections.size);
      socket.send({ type: 'welcome', connectionId });
      await this.onClientConnected?.(conn.info);
      return connectionId;
    });
  }

  async handleDisconnect(connectionId: string): Promise<void> {
    const conn = this.connections.get(connectionId);
    if (!conn) return;
    this.connections.delete(connectionId);
    await this.presence.remove(this.entry(conn)).catch((error) => {
      this.logger.warn({ connectionId, error: (error as Error).message }, 'presence removal failed');
    });
    this.metrics?.increment('realtime.connections.closed', 1);
    this.metrics?.gauge('realtime.connections.active', this.connections.size);
    await this.onClientDisconnected?.(conn.info);
  }

  /** Call when the transport sees any sign of life (pong frame, message). */
  markAlive(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (conn) conn.alive = true;
  }

  /** Parses and dispatches one client frame. Never throws; protocol errors are sent to the client. */
  async handleMessage(connectionId: string, raw: string | Buffer | unknown): Promise<void> {
    const conn = this.connections.get(connectionId);
    if (!conn) return;
    conn.alive = true;
    let data: unknown = raw;
    if (typeof raw === 'string' || Buffer.isBuffer(raw)) {
      try {
        data = JSON.parse(raw.toString());
      } catch {
        conn.socket.send({ type: 'error', code: 'realtime/invalid-message', message: 'Message must be JSON' });
        return;
      }
    }
    const parsed = clientMessageSchema.safeParse(data);
    if (!parsed.success) {
      conn.socket.send({ type: 'error', code: 'realtime/invalid-message', message: parsed.error.issues[0]?.message ?? 'Invalid message' });
      return;
    }
    const msg = parsed.data;
    try {
      switch (msg.type) {
        case 'ping':
          conn.socket.send({ type: 'pong', id: msg.id });
          return;
        case 'subscribe':
          await this.subscribe(connectionId, msg.channel, msg.id);
          return;
        case 'unsubscribe':
          await this.unsubscribe(connectionId, msg.channel, msg.id);
          return;
        case 'publish':
          await this.clientPublish(conn, msg.channel, msg.data, msg.id);
          return;
      }
    } catch (error) {
      const err = error as { code?: string; message?: string };
      this.logger.error({ connectionId, type: msg.type, error: err.message }, 'realtime message handling failed');
      conn.socket.send({ type: 'error', code: err.code ?? 'realtime/internal', message: 'Request failed', id: msg.id });
    }
  }

  async subscribe(connectionId: string, channel: string, requestId?: string): Promise<boolean> {
    const conn = this.connections.get(connectionId);
    if (!conn) return false;
    if (conn.info.channels.has(channel)) {
      conn.socket.send({ type: 'subscribed', channel, id: requestId });
      return true;
    }
    if (conn.info.channels.size >= this.config.maxChannelsPerConnection) {
      conn.socket.send({ type: 'error', code: 'realtime/too-many-channels', message: 'Channel limit reached', channel, id: requestId });
      return false;
    }
    if (!(await this.authorize(conn.info.identity, channel, 'subscribe'))) {
      this.metrics?.increment('realtime.subscribe.denied', 1);
      conn.socket.send({ type: 'error', code: 'realtime/forbidden', message: `Not authorized for channel ${channel}`, channel, id: requestId });
      return false;
    }
    conn.info.channels.add(channel);
    conn.socket.send({ type: 'subscribed', channel, id: requestId });
    this.metrics?.increment('realtime.subscribe', 1);
    await this.onChannelSubscribed?.(conn.info, channel);
    return true;
  }

  async unsubscribe(connectionId: string, channel: string, requestId?: string): Promise<void> {
    const conn = this.connections.get(connectionId);
    if (!conn) return;
    conn.info.channels.delete(channel);
    conn.socket.send({ type: 'unsubscribed', channel, id: requestId });
  }

  private async clientPublish(conn: LocalConnection, channel: string, data: unknown, requestId?: string): Promise<void> {
    if (!this.config.allowClientPublish) {
      conn.socket.send({ type: 'error', code: 'realtime/publish-disabled', message: 'Client publishing is disabled', channel, id: requestId });
      return;
    }
    if (!(await this.authorize(conn.info.identity, channel, 'publish'))) {
      conn.socket.send({ type: 'error', code: 'realtime/forbidden', message: `Not authorized to publish to ${channel}`, channel, id: requestId });
      return;
    }
    const payload = this.onClientPublish ? await this.onClientPublish(conn.info, channel, data) : data;
    await this.fanout(
      { kind: 'channel', channel, excludeConnectionId: conn.info.connectionId },
      { type: 'message', channel, data: payload, from: conn.info.identity.userId },
    );
    conn.socket.send({ type: 'published', channel, id: requestId });
  }

  /** Sends to every subscriber of `channel` on every instance. */
  async broadcast(_ctx: Context, channel: string, data: unknown, options: { excludeConnectionId?: string } = {}): Promise<void> {
    return withSpan(this.tracer, 'realtime.broadcast', { channel }, () =>
      this.fanout({ kind: 'channel', channel, excludeConnectionId: options.excludeConnectionId }, { type: 'message', channel, data }),
    );
  }

  /** Sends to every connection of `userId` within the caller's tenant, on every instance. */
  async sendToUser(ctx: Context, userId: string, data: unknown, options: { channel?: string } = {}): Promise<void> {
    return withSpan(this.tracer, 'realtime.sendToUser', { userId }, () =>
      this.fanout({ kind: 'user', userId, tenantId: ctx.tenantId }, { type: 'message', channel: options.channel, data }),
    );
  }

  async sendToConnection(_ctx: Context, connectionId: string, data: unknown): Promise<void> {
    await this.fanout({ kind: 'connection', connectionId }, { type: 'message', data });
  }

  async getOnlineUsers(ctx: Context): Promise<string[]> {
    return this.presence.onlineUsers(ctx.tenantId);
  }

  async isUserOnline(ctx: Context, userId: string): Promise<boolean> {
    return (await this.presence.countConnections(ctx.tenantId, userId)) > 0;
  }

  private async fanout(target: BackplaneTarget, message: ServerMessage): Promise<void> {
    try {
      await this.backplane.publish({ target, message, origin: this.instanceId });
    } catch (cause) {
      throw new RealtimeError('realtime/backplane-failed', 'Failed to fan out realtime message', { cause });
    }
    this.metrics?.increment('realtime.fanout', 1, { kind: target.kind });
  }

  private deliver({ target, message }: BackplaneMessage): void {
    if (target.kind === 'connection') {
      this.connections.get(target.connectionId)?.socket.send(message);
      return;
    }
    for (const conn of this.connections.values()) {
      const { info } = conn;
      const match =
        target.kind === 'channel'
          ? info.channels.has(target.channel) && info.connectionId !== target.excludeConnectionId
          : info.identity.userId === target.userId && info.identity.tenantId === target.tenantId;
      if (match) conn.socket.send(message);
    }
  }

  private async heartbeat(): Promise<void> {
    for (const [id, conn] of [...this.connections]) {
      if (conn.socket.ping) {
        if (!conn.alive) {
          this.metrics?.increment('realtime.connections.timed_out', 1);
          conn.socket.close(CLOSE_CODES.heartbeatTimeout, 'Heartbeat timeout');
          await this.handleDisconnect(id);
          continue;
        }
        conn.alive = false;
        conn.socket.ping();
      }
      await this.presence.touch(this.entry(conn), this.config.connectionTtlMs).catch(() => undefined);
    }
  }

  async connect(): Promise<void> {
    if (this.started) return;
    this.backplane.onMessage((m) => this.deliver(m));
    await this.presence.connect();
    await this.backplane.connect();
    this.heartbeatTimer = setInterval(() => {
      this.heartbeat().catch((error) => this.logger.warn({ error: (error as Error).message }, 'realtime heartbeat failed'));
    }, this.config.heartbeatIntervalMs);
    this.heartbeatTimer.unref?.();
    this.started = true;
  }

  /** Closes local connections (1001 so clients reconnect elsewhere) and releases presence. */
  async disconnect(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const [id, conn] of [...this.connections]) {
      conn.socket.close(CLOSE_CODES.goingAway, 'Server shutting down');
      await this.handleDisconnect(id);
    }
    await this.backplane.disconnect();
    await this.presence.disconnect();
    this.started = false;
  }

  async isHealthy(): Promise<boolean> {
    const [b, p] = await Promise.all([this.backplane.isHealthy(), this.presence.isHealthy()]);
    return b && p;
  }

  protected onClientConnected?(info: ConnectionInfo): Promise<void>;
  protected onClientDisconnected?(info: ConnectionInfo): Promise<void>;
  protected onChannelSubscribed?(info: ConnectionInfo, channel: string): Promise<void>;
  /** Validate or transform client-published data. Throw a `MariachiError` to reject. */
  protected onClientPublish?(info: ConnectionInfo, channel: string, data: unknown): Promise<unknown>;
}

export class DefaultRealtime extends Realtime {}
