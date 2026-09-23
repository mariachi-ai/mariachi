import { RealtimeError } from '@mariachi/core';
import type Redis from 'ioredis';
import type { Logger } from '@mariachi/core';
import { MemoryBackplane, MemoryPresenceStore } from './adapters/memory';
import { RedisBackplane, RedisPresenceStore } from './adapters/redis';
import type { Backplane, PresenceStore } from './types';

export type {
  RealtimeConfig,
  ClientMessage,
  ServerMessage,
  ConnectionInfo,
  ConnectionIdentity,
  ChannelAction,
  ChannelAuthorizer,
  RealtimeSocket,
  Backplane,
  BackplaneMessage,
  BackplaneTarget,
  PresenceStore,
  PresenceEntry,
} from './types';
export { clientMessageSchema } from './types';
export { defaultChannelAuthorizer } from './authorize';
export { Realtime, DefaultRealtime, CLOSE_CODES, type RealtimeDeps } from './realtime';
export { MemoryBackplane, MemoryBackplaneHub, MemoryPresenceStore } from './adapters/memory';
export { RedisBackplane, RedisPresenceStore, type RedisRealtimeOptions } from './adapters/redis';
export { WSAdapter, type WSAdapterConfig } from './adapters/ws';

export type RealtimeInfraConfig =
  | { adapter: 'memory' }
  | { adapter: 'redis'; url?: string; client?: Redis; prefix?: string; logger?: Logger };

/** Builds the backplane and presence store for `new DefaultRealtime({ ...createRealtimeInfra(cfg) })`. */
export function createRealtimeInfra(config: RealtimeInfraConfig): { backplane: Backplane; presence: PresenceStore } {
  switch (config.adapter) {
    case 'memory':
      return { backplane: new MemoryBackplane(), presence: new MemoryPresenceStore() };
    case 'redis':
      return { backplane: new RedisBackplane(config), presence: new RedisPresenceStore(config) };
    default:
      throw new RealtimeError('realtime/unknown-adapter', `Unknown realtime adapter: ${(config as { adapter: string }).adapter}`);
  }
}
