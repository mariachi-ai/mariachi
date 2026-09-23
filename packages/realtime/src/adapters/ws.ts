import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { resolveInstrumentation, type Disposable, type InstrumentationDeps, type Logger } from '@mariachi/core';
import type { Realtime } from '../realtime';
import type { ConnectionIdentity, RealtimeSocket } from '../types';

export interface WSAdapterConfig {
  /** Attach to an existing HTTP server (recommended: share the API port). */
  server?: Server;
  /** Or listen on a dedicated port. */
  port?: number;
  host?: string;
  path?: string;
  /**
   * Resolve the caller during the HTTP upgrade. `token` comes from `Authorization: Bearer` or the
   * `token` query parameter; use `req` for cookies or other schemes. Return null to reject with 401.
   */
  authenticate: (token: string | null, req: IncomingMessage) => Promise<ConnectionIdentity | null>;
  /** Allowed `Origin` values. Unset allows any (fine for non-browser clients; set it for browsers). */
  allowedOrigins?: string[];
  /** Default 64 KiB. */
  maxPayloadBytes?: number;
}

function reject(socket: Duplex, status: number, message: string): void {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

function extractToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  const url = new URL(req.url ?? '/', 'http://localhost');
  return url.searchParams.get('token');
}

/** WebSocket transport for `Realtime`. */
export class WSAdapter implements Disposable {
  private readonly wss: WebSocketServer;
  private readonly logger: Logger;
  private readonly path: string;
  private server?: Server;
  private ownsServer = false;
  private readonly onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => void this.upgrade(req, socket, head);

  constructor(
    private readonly realtime: Realtime,
    private readonly config: WSAdapterConfig,
    instrumentation?: InstrumentationDeps,
  ) {
    this.logger = resolveInstrumentation(instrumentation).logger;
    this.path = config.path ?? '/ws';
    this.wss = new WebSocketServer({ noServer: true, maxPayload: config.maxPayloadBytes ?? 64 * 1024 });
  }

  /** The bound address (useful with `port: 0`). */
  address(): { port: number } | null {
    const a = this.server?.address();
    return a && typeof a === 'object' ? { port: a.port } : null;
  }

  async connect(): Promise<void> {
    await this.realtime.connect();
    this.server = this.config.server ?? createServer((_req, res) => res.writeHead(426).end());
    this.ownsServer = !this.config.server;
    this.server.on('upgrade', this.onUpgrade);
    if (this.ownsServer) {
      await new Promise<void>((resolve) => this.server!.listen(this.config.port ?? 0, this.config.host, resolve));
    }
    this.logger.info({ path: this.path, port: this.address()?.port }, 'websocket server ready');
  }

  async disconnect(): Promise<void> {
    this.server?.off('upgrade', this.onUpgrade);
    await this.realtime.disconnect();
    for (const ws of this.wss.clients) ws.terminate();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
    if (this.ownsServer && this.server) await new Promise<void>((resolve) => this.server!.close(() => resolve()));
  }

  async isHealthy(): Promise<boolean> {
    return !!this.server?.listening && (await this.realtime.isHealthy());
  }

  private async upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (pathname !== this.path) {
      // Another upgrade listener on a shared server may own this path.
      if (this.ownsServer) reject(socket, 404, 'Not Found');
      return;
    }
    const origin = req.headers.origin;
    if (this.config.allowedOrigins && (!origin || !this.config.allowedOrigins.includes(origin))) {
      reject(socket, 403, 'Forbidden');
      return;
    }
    let identity: ConnectionIdentity | null;
    try {
      identity = await this.config.authenticate(extractToken(req), req);
    } catch (error) {
      this.logger.warn({ error: (error as Error).message }, 'websocket authentication failed');
      identity = null;
    }
    if (!identity) {
      reject(socket, 401, 'Unauthorized');
      return;
    }
    const who = identity;
    this.wss.handleUpgrade(req, socket, head, (ws) => void this.attach(ws, who));
  }

  private async attach(ws: WebSocket, identity: ConnectionIdentity): Promise<void> {
    const socket: RealtimeSocket = {
      send: (msg) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      },
      ping: () => {
        if (ws.readyState === WebSocket.OPEN) ws.ping();
      },
      close: (code, reason) => ws.close(code, reason),
    };
    // Buffer frames that arrive before registration completes.
    const early: Buffer[] = [];
    const onEarly = (data: Buffer) => early.push(data);
    ws.on('message', onEarly);

    const connectionId = await this.realtime.handleConnect(identity, socket);
    ws.off('message', onEarly);
    if (!connectionId) return;

    ws.on('message', (data: Buffer) => void this.realtime.handleMessage(connectionId, data));
    ws.on('pong', () => this.realtime.markAlive(connectionId));
    ws.on('close', () => void this.realtime.handleDisconnect(connectionId));
    ws.on('error', (err) => {
      this.logger.warn({ connectionId, error: err.message }, 'websocket error');
      ws.terminate();
    });
    for (const data of early) await this.realtime.handleMessage(connectionId, data);
  }
}
