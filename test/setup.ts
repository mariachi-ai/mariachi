import type { StartedTestContainer } from 'testcontainers';

/**
 * Shared integration-test infrastructure.
 *
 * If `DATABASE_URL` / `REDIS_URL` / `TYPESENSE_URL` are set (CI service containers,
 * or `docker compose -f docker-compose.dev.yml up`), those are used directly.
 * Otherwise a throwaway container is started with Testcontainers.
 */

const started: StartedTestContainer[] = [];

export async function startRedis(): Promise<string> {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  const { GenericContainer } = await import('testcontainers');
  const container = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
  started.push(container);
  return `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
}

export async function startPostgres(): Promise<string> {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { GenericContainer, Wait } = await import('testcontainers');
  const container = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({ POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'mariachi_test' })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  started.push(container);
  return `postgresql://postgres:test@${container.getHost()}:${container.getMappedPort(5432)}/mariachi_test`;
}

/** NATS with JetStream enabled. */
export async function startNats(): Promise<string> {
  if (process.env.NATS_URL) return process.env.NATS_URL;
  const { GenericContainer, Wait } = await import('testcontainers');
  const container = await new GenericContainer('nats:2.10-alpine')
    .withCommand(['-js'])
    .withExposedPorts(4222)
    .withWaitStrategy(Wait.forLogMessage(/Server is ready/))
    .start();
  started.push(container);
  return `nats://${container.getHost()}:${container.getMappedPort(4222)}`;
}

export async function startTypesense(): Promise<{ url: string; apiKey: string }> {
  const apiKey = process.env.TYPESENSE_API_KEY ?? 'test-key';
  if (process.env.TYPESENSE_URL) return { url: process.env.TYPESENSE_URL, apiKey };
  const { GenericContainer, Wait } = await import('testcontainers');
  const container = await new GenericContainer('typesense/typesense:27.1')
    .withEnvironment({ TYPESENSE_API_KEY: apiKey, TYPESENSE_DATA_DIR: '/tmp' })
    .withExposedPorts(8108)
    .withWaitStrategy(Wait.forHttp('/health', 8108))
    .start();
  started.push(container);
  return { url: `http://${container.getHost()}:${container.getMappedPort(8108)}`, apiKey };
}

/** S3-compatible storage (MinIO). Set `S3_ENDPOINT` (+ `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`) to reuse one. */
export async function startMinio(): Promise<{ endpoint: string; accessKeyId: string; secretAccessKey: string }> {
  const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? 'minioadmin';
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? 'minioadmin';
  if (process.env.S3_ENDPOINT) return { endpoint: process.env.S3_ENDPOINT, accessKeyId, secretAccessKey };
  const { GenericContainer, Wait } = await import('testcontainers');
  const container = await new GenericContainer('quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z')
    .withEnvironment({ MINIO_ROOT_USER: accessKeyId, MINIO_ROOT_PASSWORD: secretAccessKey })
    .withCommand(['server', '/data'])
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forHttp('/minio/health/live', 9000))
    .start();
  started.push(container);
  return { endpoint: `http://${container.getHost()}:${container.getMappedPort(9000)}`, accessKeyId, secretAccessKey };
}

export async function stopAll(): Promise<void> {
  await Promise.all(started.splice(0).map((c) => c.stop()));
}
