import { afterAll, beforeAll } from 'vitest';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { MemoryCacheAdapter, RedisCacheAdapter, RedisDistributedLock } from '@mariachi/cache';
import { applySchema, createPostgresDatabase, type PostgresDatabase } from '@mariachi/database-postgres';
import { notificationsTable } from '@mariachi/notifications';
import { DrizzleNotificationStore } from '@mariachi/notifications/postgres';
import { TypesenseSearchAdapter } from '@mariachi/search';
import { S3StorageAdapter } from '@mariachi/storage';
import { startMinio, startPostgres, startRedis, startTypesense, stopAll } from '../../../test/setup';
import { TestCacheClient } from './adapters/cache';
import { TestLock } from './adapters/lock';
import { cacheContract, inboxContract, lockContract, searchContract, storageContract } from './contracts/index';

/*
 * The same suites as contracts.test.ts, against real infrastructure. If a double and its real
 * adapter disagree, one of these runs fails.
 */

const infra: {
  s3?: { endpoint: string; accessKeyId: string; secretAccessKey: string; bucket: string };
  typesense?: { url: string; apiKey: string };
  redisUrl?: string;
  database?: PostgresDatabase;
} = {};
const closers: Array<() => Promise<void>> = [];

beforeAll(async () => {
  const [minio, typesense, redisUrl, pgUrl] = await Promise.all([startMinio(), startTypesense(), startRedis(), startPostgres()]);
  const bucket = `contract-${crypto.randomUUID().slice(0, 8)}`;
  const admin = new S3Client({
    region: 'us-east-1',
    endpoint: minio.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: minio.accessKeyId, secretAccessKey: minio.secretAccessKey },
  });
  await admin.send(new CreateBucketCommand({ Bucket: bucket }));
  admin.destroy();
  infra.s3 = { ...minio, bucket };
  infra.typesense = typesense;
  infra.redisUrl = redisUrl;
  infra.database = createPostgresDatabase({ url: pgUrl });
  await infra.database.connect();
  await applySchema(infra.database.db, [notificationsTable]);
}, 300_000);

afterAll(async () => {
  for (const close of closers.splice(0)) await close();
  await infra.database?.disconnect();
  await stopAll();
});

storageContract('s3 (minio)', () =>
  new S3StorageAdapter({
    adapter: 's3',
    bucket: infra.s3!.bucket,
    region: 'us-east-1',
    endpoint: infra.s3!.endpoint,
    forcePathStyle: true,
    basePath: 'contract',
    credentials: { accessKeyId: infra.s3!.accessKeyId, secretAccessKey: infra.s3!.secretAccessKey },
  }),
);

searchContract('typesense', () => new TypesenseSearchAdapter(infra.typesense!));

inboxContract('postgres', () => new DrizzleNotificationStore(infra.database!.db));

cacheContract('redis', (prefix) => {
  const cache = new RedisCacheAdapter({ adapter: 'redis', url: infra.redisUrl!, prefix });
  return cache;
});
cacheContract('memory (same run)', (prefix) => new MemoryCacheAdapter({ adapter: 'memory', prefix }));
cacheContract('test double (same run)', (prefix) => new TestCacheClient({ prefix }));

lockContract('redis', async () => {
  const lock = new RedisDistributedLock({ adapter: 'redis', url: infra.redisUrl! });
  await lock.connect();
  closers.push(() => lock.disconnect());
  return lock;
});
lockContract('test double (same run)', () => new TestLock());
