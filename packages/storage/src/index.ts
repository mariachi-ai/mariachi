import type { StorageConfig, StorageClient } from './types';
import { S3StorageAdapter } from './adapters/s3';
import { LocalStorageAdapter } from './adapters/local';

export type {
  StorageConfig,
  StorageClient,
  AccessControl,
  PutOptions,
  SignedUrlOptions,
  UploadValidation,
} from './types';

export { S3StorageAdapter } from './adapters/s3';
export { LocalStorageAdapter } from './adapters/local';

export function createStorage(config: StorageConfig): StorageClient {
  switch (config.adapter) {
    case 's3':
      return new S3StorageAdapter(config);
    case 'local':
      return new LocalStorageAdapter(config);
    default:
      throw new Error(`Unknown storage adapter: ${config.adapter}`);
  }
}

export { Storage, DefaultStorage } from './storage';
