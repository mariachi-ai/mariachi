import type { EncryptionAdapter } from './adapter';

export type EncryptionConfig =
  | {
      /** AES-256-GCM envelope encryption with locally held keys (dev / self-hosted). */
      adapter: 'local';
      /** Key id → base64 32-byte key or passphrase (≥ 32 chars). */
      keys: Record<string, string>;
      /** Key used for new ciphertexts. Defaults to the last entry in `keys`. */
      activeKeyId?: string;
    }
  | {
      adapter: 'aws-kms';
      /** KMS key ARN, alias ARN, key ID, or alias name. */
      awsKmsKeyId: string;
      awsRegion?: string;
      encryptionContext?: Record<string, string>;
    }
  | {
      adapter: 'gcp-kms';
      /** Full CryptoKey resource name. */
      gcpKmsKeyName: string;
    }
  | {
      /** Bring your own key provider. */
      adapter: 'custom';
      instance: EncryptionAdapter;
    };
