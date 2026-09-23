import { EventsError } from '@mariachi/core';
import type { EventBus, EventBusConfig } from './types';
import { MemoryEventBus } from './adapters/memory';
import { RedisEventBusAdapter } from './adapters/redis';
import { RedisStreamsEventBus } from './adapters/redis-streams';
import { NATSEventBusAdapter } from './adapters/nats';
import { NATSJetStreamAdapter } from './adapters/nats-jetstream';

export function createEventBus(config: EventBusConfig): EventBus {
  switch (config.adapter) {
    case 'memory':
      return new MemoryEventBus(config.logger);
    case 'redis':
      return new RedisEventBusAdapter(config);
    case 'redis-streams':
      return new RedisStreamsEventBus(config);
    case 'nats':
      return new NATSEventBusAdapter({ ...config, servers: config.servers ?? [config.url ?? 'nats://localhost:4222'] });
    case 'nats-jetstream':
      if (!config.stream) throw new EventsError('events/missing-stream', 'nats-jetstream adapter requires `stream`');
      return new NATSJetStreamAdapter({ ...config, servers: config.servers ?? [config.url ?? 'nats://localhost:4222'] });
    default:
      throw new EventsError('events/unknown-adapter', `Unknown EventBus adapter: ${(config as { adapter: string }).adapter}`);
  }
}
