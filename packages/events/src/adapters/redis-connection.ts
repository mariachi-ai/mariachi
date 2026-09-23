import Redis from 'ioredis';

export function openRedis(url: string | undefined, existing?: Redis): { client: Redis; owned: boolean } {
  if (existing) return { client: existing, owned: false };
  return { client: new Redis(url ?? 'redis://localhost:6379', { lazyConnect: true }), owned: true };
}

export async function ensureConnected(client: Redis): Promise<void> {
  if (client.status === 'wait' || client.status === 'end') await client.connect();
}

export async function closeRedis(client: Redis): Promise<void> {
  if (client.status === 'end') return;
  await client.quit().catch(() => client.disconnect());
}

export async function pingRedis(client: Redis): Promise<boolean> {
  try {
    return (await client.ping()) === 'PONG';
  } catch {
    return false;
  }
}
