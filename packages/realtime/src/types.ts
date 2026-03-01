export interface RealtimeConfig {
  port?: number;
  path?: string;
  heartbeatIntervalMs?: number;
  maxConnectionsPerUser?: number;
}

export interface ClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping' | 'publish';
  channel?: string;
  data?: unknown;
}

export interface ServerMessage {
  type: 'message' | 'subscribed' | 'unsubscribed' | 'error' | 'pong' | 'welcome';
  channel?: string;
  data?: unknown;
  code?: string;
  message?: string;
}

export interface ConnectionInfo {
  connectionId: string;
  userId: string;
  tenantId: string;
  channels: Set<string>;
  connectedAt: Date;
}

export interface PresenceInfo {
  userId: string;
  status: 'online' | 'away' | 'offline';
  lastSeen: Date;
  connectionCount: number;
}

export interface ChannelAuthorizationFn {
  (userId: string, tenantId: string, channel: string): Promise<boolean>;
}
