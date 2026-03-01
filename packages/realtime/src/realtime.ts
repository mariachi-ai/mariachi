import type { Logger, Instrumentable } from '@mariachi/core';
import { withSpan, getContainer, KEYS } from '@mariachi/core';
import type { TracerAdapter, MetricsAdapter } from '@mariachi/core';
import type { ConnectionInfo, ServerMessage, ChannelAuthorizationFn, RealtimeConfig } from './types';
import type { ConnectionStore } from './connection-store';

export interface RealtimeDeps {
  connectionStore: ConnectionStore;
  authorize?: ChannelAuthorizationFn;
  config?: RealtimeConfig;
}

export abstract class Realtime implements Instrumentable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly connectionStore: ConnectionStore;
  protected readonly authorize?: ChannelAuthorizationFn;
  protected readonly config: RealtimeConfig;
  protected readonly localConnections = new Map<string, { send: (msg: ServerMessage) => void; info: ConnectionInfo }>();

  constructor(deps: RealtimeDeps) {
    const container = getContainer();
    this.logger = container.resolve<Logger>(KEYS.Logger);
    this.tracer = container.has(KEYS.Tracer) ? container.resolve<TracerAdapter>(KEYS.Tracer) : undefined;
    this.metrics = container.has(KEYS.Metrics) ? container.resolve<MetricsAdapter>(KEYS.Metrics) : undefined;
    this.connectionStore = deps.connectionStore;
    this.authorize = deps.authorize;
    this.config = deps.config ?? {};
  }

  async handleConnect(connectionId: string, userId: string, tenantId: string, sendFn: (msg: ServerMessage) => void): Promise<void> {
    return withSpan(this.tracer, 'realtime.handleConnect', { connectionId, userId }, async () => {
      const info: ConnectionInfo = {
        connectionId,
        userId,
        tenantId,
        channels: new Set(),
        connectedAt: new Date(),
      };
      this.localConnections.set(connectionId, { send: sendFn, info });
      await this.connectionStore.addConnection(connectionId, userId, tenantId);
      await this.connectionStore.updatePresence(userId);
      this.metrics?.increment('realtime.connections.opened', 1);
      this.metrics?.gauge('realtime.connections.active', this.localConnections.size);
      this.logger.info({ connectionId, userId, tenantId }, 'Client connected');
      sendFn({ type: 'welcome', data: { connectionId } });
      await this.onClientConnected?.(connectionId, userId, tenantId);
    });
  }

  async handleDisconnect(connectionId: string): Promise<void> {
    return withSpan(this.tracer, 'realtime.handleDisconnect', { connectionId }, async () => {
      const conn = this.localConnections.get(connectionId);
      if (!conn) return;
      this.localConnections.delete(connectionId);
      await this.connectionStore.removeConnection(connectionId, conn.info.userId);
      await this.connectionStore.updatePresence(conn.info.userId);
      this.metrics?.increment('realtime.connections.closed', 1);
      this.metrics?.gauge('realtime.connections.active', this.localConnections.size);
      this.logger.info({ connectionId, userId: conn.info.userId }, 'Client disconnected');
      await this.onClientDisconnected?.(connectionId, conn.info.userId);
    });
  }

  async subscribeToChannel(connectionId: string, channel: string): Promise<boolean> {
    return withSpan(this.tracer, 'realtime.subscribe', { connectionId, channel }, async () => {
      const conn = this.localConnections.get(connectionId);
      if (!conn) return false;

      if (this.authorize) {
        const allowed = await this.authorize(conn.info.userId, conn.info.tenantId, channel);
        if (!allowed) {
          conn.send({ type: 'error', code: 'auth/forbidden', message: `Not authorized for channel: ${channel}` });
          this.metrics?.increment('realtime.subscribe.denied', 1, { channel });
          return false;
        }
      }

      conn.info.channels.add(channel);
      await this.connectionStore.addToChannel(connectionId, channel);
      conn.send({ type: 'subscribed', channel });
      this.metrics?.increment('realtime.subscribe.success', 1, { channel });
      this.logger.debug({ connectionId, channel, userId: conn.info.userId }, 'Subscribed to channel');
      await this.onChannelSubscribed?.(connectionId, conn.info.userId, channel);
      return true;
    });
  }

  async unsubscribeFromChannel(connectionId: string, channel: string): Promise<void> {
    const conn = this.localConnections.get(connectionId);
    if (!conn) return;
    conn.info.channels.delete(channel);
    await this.connectionStore.removeFromChannel(connectionId, channel);
    conn.send({ type: 'unsubscribed', channel });
    this.metrics?.increment('realtime.unsubscribe', 1, { channel });
  }

  async broadcast(channel: string, data: unknown): Promise<void> {
    return withSpan(this.tracer, 'realtime.broadcast', { channel }, async () => {
      const message: ServerMessage = { type: 'message', channel, data };
      let sent = 0;
      for (const [, conn] of this.localConnections) {
        if (conn.info.channels.has(channel)) {
          conn.send(message);
          sent++;
        }
      }
      this.metrics?.increment('realtime.broadcast', 1, { channel });
      this.metrics?.histogram('realtime.broadcast.recipients', sent, { channel });
      this.logger.debug({ channel, recipients: sent }, 'Broadcast sent');
    });
  }

  async sendToUser(userId: string, data: unknown): Promise<void> {
    return withSpan(this.tracer, 'realtime.sendToUser', { userId }, async () => {
      const message: ServerMessage = { type: 'message', data };
      let sent = 0;
      for (const [, conn] of this.localConnections) {
        if (conn.info.userId === userId) {
          conn.send(message);
          sent++;
        }
      }
      this.metrics?.increment('realtime.sendToUser', 1);
      this.logger.debug({ userId, connectionsSent: sent }, 'Direct message sent to user');
    });
  }

  async getOnlineUsers(): Promise<string[]> {
    return this.connectionStore.getOnlineUsers();
  }

  async isUserOnline(userId: string): Promise<boolean> {
    return this.connectionStore.isUserOnline(userId);
  }

  protected onClientConnected?(connectionId: string, userId: string, tenantId: string): Promise<void>;
  protected onClientDisconnected?(connectionId: string, userId: string): Promise<void>;
  protected onChannelSubscribed?(connectionId: string, userId: string, channel: string): Promise<void>;
}

export class DefaultRealtime extends Realtime {}
