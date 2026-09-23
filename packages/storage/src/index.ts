import { ConfigError } from '@mariachi/core';
import type { StorageConfig, StorageClient } from './types';
import { S3StorageAdapter } from './adapters/s3';
import { LocalStorageAdapter } from './adapters/local';
import { MemoryStorageAdapter } from './adapters/memory';

export type {
  StorageAdapterName,
  StorageConfig,
  StorageClient,
  AccessControl,
  PutOptions,
  SignedUrlOptions,
  SignedUploadOptions,
  ObjectInfo,
  ListOptions,
  ListResult,
  UploadValidation,
} from './types';

export { S3StorageAdapter } from './adapters/s3';
export { LocalStorageAdapter } from './adapters/local';
export { MemoryStorageAdapter } from './adapters/memory';
export { normalizeKey, buildKey } from './keys';
export { sniffContentType, contentMatchesType } from './sniff';
export { Storage, DefaultStorage, type StorageServiceConfig } from './storage';
export { handleSignedLocalRequest, type LocalStorageHttpRequest, type LocalStorageHttpResponse } from './local-http';
export type { CannedAcl } from './types';

export function createStorage(config: StorageConfig): StorageClient {
  switch (config.adapter) {
    case 's3':
      return new S3StorageAdapter(config);
    case 'local':
      return new LocalStorageAdapter(config);
    case 'memory':
      return new MemoryStorageAdapter();
    default:
      throw new ConfigError('storage/unknown-adapter', `Unknown storage adapter: ${String((config as { adapter: unknown }).adapter)}`);
  }
}
