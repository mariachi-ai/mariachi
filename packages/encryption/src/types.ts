export interface EncryptionConfig {
  /**
   * Which adapter to use:
   * - `"local"`    — AES-256-GCM with a passphrase (dev / single-instance)
   * - `"aws-kms"`  — AWS KMS envelope encryption (production)
   * - `"gcp-kms"`  — Google Cloud KMS envelope encryption (production)
   */
  adapter: 'local' | 'aws-kms' | 'gcp-kms';

  /** Required for `local`. Passphrase for AES key derivation (≥ 16 chars). */
  encryptionKey?: string;

  /** Required for `aws-kms`. KMS key ARN, alias ARN, key ID, or alias name. */
  awsKmsKeyId?: string;
  /** Optional for `aws-kms`. Falls back to AWS_REGION env var. */
  awsRegion?: string;

  /** Required for `gcp-kms`. Full resource name of the CryptoKey. */
  gcpKmsKeyName?: string;
}
