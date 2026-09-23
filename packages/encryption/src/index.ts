import { ConfigError } from '@mariachi/core';
import type { EncryptionConfig } from './types';
import type { EncryptionAdapter } from './adapter';
import { Encryption } from './encryption';
import { LocalAdapter } from './adapters/local';
import { AwsKmsAdapter } from './adapters/aws-kms';
import { GcpKmsAdapter } from './adapters/gcp-kms';

export type { EncryptionConfig } from './types';
export { EncryptionAdapter, type DataKey } from './adapter';
export { Encryption, type EncryptOptions } from './encryption';
export { LocalAdapter, generateLocalKey } from './adapters/local';
export { AwsKmsAdapter, type AwsKmsOptions } from './adapters/aws-kms';
export { GcpKmsAdapter, type GcpKmsOptions } from './adapters/gcp-kms';
export { isEnvelope as isEncrypted } from './envelope';

/**
 * Creates an `Encryption` instance backed by the configured key provider.
 *
 * ```ts
 * const config = useConfig();
 * const encryption = createEncryption(
 *   config.env === 'production'
 *     ? { adapter: 'aws-kms', awsKmsKeyId: config.encryption.kmsKeyId }
 *     : { adapter: 'local', keys: { k1: config.encryption.localKey } },
 * );
 * ```
 */
export function createEncryption(config: EncryptionConfig): Encryption {
  let adapter: EncryptionAdapter;
  switch (config.adapter) {
    case 'local':
      adapter = new LocalAdapter(config.keys, config.activeKeyId);
      break;
    case 'aws-kms':
      adapter = new AwsKmsAdapter({
        keyId: config.awsKmsKeyId,
        region: config.awsRegion,
        encryptionContext: config.encryptionContext,
      });
      break;
    case 'gcp-kms':
      adapter = new GcpKmsAdapter({ keyName: config.gcpKmsKeyName });
      break;
    case 'custom':
      adapter = config.instance;
      break;
    default:
      throw new ConfigError(
        'encryption/unknown-adapter',
        `Unknown encryption adapter: ${String((config as { adapter: unknown }).adapter)}`,
      );
  }
  return new Encryption(adapter);
}
