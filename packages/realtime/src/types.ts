import { z } from 'zod';

export interface RealtimeConfig {
  /** Server-initiated ping interval; connections that miss one full interval are terminated. Default 30s. */
  heartbeatIntervalMs?: number;
  /** Presence entries expire after this without a heartbeat (covers crashed instances). Default 3 heartbeats. */
  connectionTtlMs?: number;
  /** Across all instances. Unlimited when unset. */
  maxConnectionsPerUser?: number;
  /** Default 100. */
  maxChannelsPerConnection?: number;
  /** Let clients send `publish` messages (still subject to channel authorization). Default false. */
  allowClientPublish?: boolean;
  /** Identifies this process in the backplane. Default random. */
  instanceId?: string;
}

/** Who is on the other end of a connection. Established once, at connect time. */
export interface ConnectionIdentity {
  userId: string;
  tenantId: string | null;
  scopes?: string[];
}

export type ChannelAction = 'subscribe' | 'publish';

/** Returns true to allow. Called for every subscribe and client publish. */
export type ChannelAuthorizer = (identity: ConnectionIdentity, channel: string, action: ChannelAction) => Promise<boolean> | boolean;

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe'), channel: z.string().min(1).max(256), id: z.string().max(64).optional() }),
  z.object({ type: z.literal('unsubscribe'), channel: z.string().min(1).max(256), id: z.string().max(64).optional() }),
  z.object({ type: z.literal('publish'), channel: z.string().min(1).max(256), data: z.unknown(), id: z.string().max(64).optional() }),
  z.object({ type: z.literal('ping'), id: z.string().max(64).optional() }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ServerMessage =
  | { type: 'welcome'; connectionId: string }
  | { type: 'subscribed' | 'unsubscribed'; channel: string; id?: string }
  | { type: 'message'; channel?: string; data: unknown; from?: string }
  | { type: 'published'; channel: string; id?: string }
  | { type: 'pong'; id?: string }
  | { type: 'error'; code: string; message: string; channel?: string; id?: string };

export interface ConnectionInfo {
  connectionId: string;
  identity: ConnectionIdentity;
  channels: Set<string>;
  connectedAt: Date;
}

/** Transport hooks the realtime core needs from a socket. */
export interface RealtimeSocket {
  send(message: ServerMessage): void;
  /** Transport-level ping (e.g. WebSocket ping frame). Optional; app-level `ping` also counts as alive. */
  ping?(): void;
  close(code: number, reason: string): void;
}

export type BackplaneTarget =
  | { kind: 'channel'; channel: string; excludeConnectionId?: string }
  | { kind: 'user'; userId: string; tenantId: string | null }
  | { kind: 'connection'; connectionId: string };

export interface BackplaneMessage {
  target: BackplaneTarget;
  message: ServerMessage;
  origin: string;
}

/** Fans messages out to every instance so broadcasts reach connections held elsewhere. */
export interface Backplane {
  publish(message: BackplaneMessage): Promise<void>;
  onMessage(handler: (message: BackplaneMessage) => void): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isHealthy(): Promise<boolean>;
}

export interface PresenceEntry {
  connectionId: string;
  userId: string;
  tenantId: string | null;
  instanceId: string;
}

/** Cross-instance presence. Entries expire unless refreshed, so crashed instances don't leave ghosts. */
export interface PresenceStore {
  /** Adds the connection and returns the user's live connection count including it. */
  add(entry: PresenceEntry, ttlMs: number): Promise<number>;
  touch(entry: PresenceEntry, ttlMs: number): Promise<void>;
  remove(entry: PresenceEntry): Promise<void>;
  countConnections(tenantId: string | null, userId: string): Promise<number>;
  onlineUsers(tenantId: string | null): Promise<string[]>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isHealthy(): Promise<boolean>;
}
