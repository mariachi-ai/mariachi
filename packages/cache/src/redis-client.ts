import Redis from 'ioredis';

/**
 * Creates an ioredis client that does not connect until `connect()` is called, so constructing
 * services never opens sockets and lifecycle startup controls when connections happen.
 */
export function createRedisClient(url = 'redis://localhost:6379'): Redis {
  return new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3, enableOfflineQueue: true });
}

export async function connectRedis(client: Redis): Promise<void> {
  if (client.status === 'wait' || client.status === 'end') await client.connect();
  await client.ping();
}

export async function disconnectRedis(client: Redis): Promise<void> {
  if (client.status === 'end' || client.status === 'wait') return;
  await client.quit();
}

export async function pingRedis(client: Redis): Promise<boolean> {
  try {
    return (await client.ping()) === 'PONG';
  } catch {
    return false;
  }
}

/** Iterates keys matching `pattern` with SCAN. */
export async function scanKeys(client: Redis, pattern: string, count = 500): Promise<string[]> {
  const out: string[] = [];
  let cursor = '0';
  do {
    const [next, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', count);
    cursor = next;
    out.push(...batch);
  } while (cursor !== '0');
  return out;
}
