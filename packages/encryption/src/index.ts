import { EncryptionError } from '@mariachi/core';
import type { EncryptionConfig } from './types';
import { EncryptionAdapter } from './adapter';
import { Encryption } from './encryption';
import { LocalAdapter } from './adapters/local';
import { AwsKmsAdapter } from './adapters/aws-kms';
import { GcpKmsAdapter } from './adapters/gcp-kms';

export type { EncryptionConfig } from './types';
export { EncryptionAdapter } from './adapter';
export { Encryption } from './encryption';
export { LocalAdapter } from './adapters/local';
export { AwsKmsAdapter } from './adapters/aws-kms';
export { GcpKmsAdapter } from './adapters/gcp-kms';

/**
 * Create an `Encryption` instance backed by the configured adapter.
 *
 * The adapter is typically chosen by the environment — ask the user
 * which adapter they want for each environment (local, staging, production).
 *
 * ```ts
 * const encryption = createEncryption({
 *   adapter: process.env.NODE_ENV === 'production' ? 'aws-kms' : 'local',
 *   encryptionKey: process.env.ENCRYPTION_KEY,
 *   awsKmsKeyId: process.env.AWS_KMS_KEY_ID,
 * });
 *
 * await encryption.encrypt('secret');
 * await encryption.decrypt(ciphertext);
 * ```
 *
 * See ENCRYPTION.md in this package for full guidance on adapters.
 */
export function createEncryption(config: EncryptionConfig): Encryption {
  let adapter: EncryptionAdapter;

  switch (config.adapter) {
    case 'local': {
      if (!config.encryptionKey) {
        throw new EncryptionError(
          'encryption/missing-key',
          'Local adapter requires encryptionKey (set ENCRYPTION_KEY env var)',
        );
      }
      adapter = new LocalAdapter(config.encryptionKey);
      break;
    }

    case 'aws-kms': {
      if (!config.awsKmsKeyId) {
        throw new EncryptionError(
          'encryption/missing-kms-key',
          'AWS KMS adapter requires awsKmsKeyId (set AWS_KMS_KEY_ID env var)',
        );
      }
      adapter = new AwsKmsAdapter(config.awsKmsKeyId, config.awsRegion);
      break;
    }

    case 'gcp-kms': {
      if (!config.gcpKmsKeyName) {
        throw new EncryptionError(
          'encryption/missing-gcp-key',
          'GCP KMS adapter requires gcpKmsKeyName (set GCP_KMS_KEY_NAME env var)',
        );
      }
      adapter = new GcpKmsAdapter(config.gcpKmsKeyName);
      break;
    }

    default:
      throw new EncryptionError(
        'encryption/unknown-adapter',
        `Unknown encryption adapter: ${(config as EncryptionConfig).adapter}`,
      );
  }

  return new Encryption(adapter);
}
