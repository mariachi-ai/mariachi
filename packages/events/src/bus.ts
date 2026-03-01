import { EventsError } from '@mariachi/core';
import type { EventBus, EventBusConfig } from './types';
import { RedisEventBusAdapter } from './adapters/redis';
import { NATSEventBusAdapter } from './adapters/nats';
import { NATSJetStreamAdapter } from './adapters/nats-jetstream';

export function createEventBus(config: EventBusConfig): EventBus {
  const prefix = config.prefix ?? 'mariachi.events';
  switch (config.adapter) {
    case 'redis': {
      const url = config.url ?? 'redis://localhost:6379';
      return new RedisEventBusAdapter(url, prefix);
    }
    case 'nats': {
      const servers = config.servers ?? [config.url ?? 'nats://localhost:4222'];
      return new NATSEventBusAdapter(servers, prefix);
    }
    case 'nats-jetstream': {
      const servers = config.servers ?? [config.url ?? 'nats://localhost:4222'];
      if (!config.jetstream?.stream) {
        throw new EventsError('events/missing-stream', 'NATS JetStream adapter requires jetstream.stream config');
      }
      return new NATSJetStreamAdapter({
        servers,
        stream: config.jetstream.stream,
        prefix,
        durableName: config.jetstream.durableName,
      });
    }
    default:
      throw new EventsError('events/unknown-adapter', `Unknown EventBus adapter: ${config.adapter}`);
  }
}
