import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Logger } from '@mariachi/core';
import { getContainer, KEYS } from '@mariachi/core';
import type { ClientMessage, ServerMessage } from '../types';
import type { Realtime } from '../realtime';

export interface WSAdapterConfig {
  port: number;
  path?: string;
  authenticate: (token: string) => Promise<{ userId: string; tenantId: string } | null>;
}

export class WSAdapter {
  private wss: WebSocketServer | null = null;
  private readonly config: WSAdapterConfig;
  private readonly realtime: Realtime;
  private readonly logger: Logger;

  constructor(realtime: Realtime, config: WSAdapterConfig) {
    this.realtime = realtime;
    this.config = config;
    const container = getContainer();
    this.logger = container.resolve<Logger>(KEYS.Logger);
  }

  start(): void {
    this.wss = new WebSocketServer({
      port: this.config.port,
      path: this.config.path ?? '/ws',
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      void this.onConnection(ws, req);
    });

    this.logger.info({ port: this.config.port, path: this.config.path ?? '/ws' }, 'WebSocket server started');
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private async onConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const token = url.searchParams.get('token') ?? req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      ws.close(4001, 'Authentication required');
      return;
    }

    const identity = await this.config.authenticate(token);
    if (!identity) {
      ws.close(4003, 'Invalid token');
      return;
    }

    const connectionId = crypto.randomUUID();
    const send = (msg: ServerMessage) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    };

    await this.realtime.handleConnect(connectionId, identity.userId, identity.tenantId, send);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as ClientMessage;
        void this.handleMessage(connectionId, msg);
      } catch {
        send({ type: 'error', code: 'protocol/invalid-message', message: 'Invalid JSON' });
      }
    });

    ws.on('close', () => {
      void this.realtime.handleDisconnect(connectionId);
    });

    ws.on('error', (err) => {
      this.logger.error({ connectionId, error: err.message }, 'WebSocket error');
      void this.realtime.handleDisconnect(connectionId);
    });
  }

  private async handleMessage(connectionId: string, msg: ClientMessage): Promise<void> {
    switch (msg.type) {
      case 'subscribe':
        if (msg.channel) {
          await this.realtime.subscribeToChannel(connectionId, msg.channel);
        }
        break;
      case 'unsubscribe':
        if (msg.channel) {
          await this.realtime.unsubscribeFromChannel(connectionId, msg.channel);
        }
        break;
      case 'ping': {
        const conn = (this.realtime as any).localConnections.get(connectionId);
        if (conn) conn.send({ type: 'pong' });
        break;
      }
    }
  }
}
