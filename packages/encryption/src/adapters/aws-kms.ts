import { ConfigError, EncryptionError } from '@mariachi/core';
import { EncryptionAdapter, type DataKey } from '../adapter';

interface KmsLikeClient {
  send(command: unknown): Promise<any>;
}

export interface AwsKmsOptions {
  keyId: string;
  region?: string;
  /** Pre-built `KMSClient` (tests, custom credentials). */
  client?: KmsLikeClient;
  /** KMS encryption context bound to every data key. */
  encryptionContext?: Record<string, string>;
}

/**
 * AWS KMS key provider. Data keys come from `GenerateDataKey`; the wrapped key is
 * stored in the envelope and unwrapped with `Decrypt`.
 *
 * Requires `@aws-sdk/client-kms` as a peer dependency.
 */
export class AwsKmsAdapter extends EncryptionAdapter {
  readonly name = 'aws-kms';
  private readonly options: AwsKmsOptions;
  private client?: KmsLikeClient;
  private sdk?: typeof import('@aws-sdk/client-kms');

  constructor(options: AwsKmsOptions) {
    super();
    if (!options.keyId) throw new ConfigError('encryption/missing-kms-key', 'AWS KMS adapter requires keyId');
    this.options = options;
    this.client = options.client;
  }

  get activeKeyId(): string {
    return this.options.keyId;
  }

  private async load(): Promise<{ client: KmsLikeClient; sdk: typeof import('@aws-sdk/client-kms') }> {
    if (!this.sdk) {
      try {
        this.sdk = await import('@aws-sdk/client-kms');
      } catch {
        throw new ConfigError('encryption/missing-dependency', 'AWS KMS adapter requires @aws-sdk/client-kms');
      }
    }
    this.client ??= new this.sdk.KMSClient({ region: this.options.region });
    return { client: this.client, sdk: this.sdk };
  }

  async generateDataKey(): Promise<DataKey> {
    const { client, sdk } = await this.load();
    let response: { CiphertextBlob?: Uint8Array; Plaintext?: Uint8Array; KeyId?: string };
    try {
      response = await client.send(
        new sdk.GenerateDataKeyCommand({
          KeyId: this.options.keyId,
          KeySpec: 'AES_256',
          EncryptionContext: this.options.encryptionContext,
        }),
      );
    } catch (err) {
      throw new EncryptionError('encryption/kms-failed', 'KMS GenerateDataKey failed', { cause: (err as Error).message });
    }
    if (!response.Plaintext || !response.CiphertextBlob) {
      throw new EncryptionError('encryption/kms-failed', 'KMS GenerateDataKey returned empty key material');
    }
    const plaintext = Buffer.from(response.Plaintext);
    response.Plaintext.fill(0);
    return { keyId: this.options.keyId, plaintext, wrapped: Buffer.from(response.CiphertextBlob) };
  }

  async unwrapDataKey(keyId: string, wrapped: Buffer): Promise<Buffer> {
    const { client, sdk } = await this.load();
    let response: { Plaintext?: Uint8Array };
    try {
      response = await client.send(
        new sdk.DecryptCommand({ CiphertextBlob: wrapped, KeyId: keyId, EncryptionContext: this.options.encryptionContext }),
      );
    } catch (err) {
      throw new EncryptionError('encryption/decrypt-failed', 'KMS Decrypt failed', { cause: (err as Error).message });
    }
    if (!response.Plaintext) throw new EncryptionError('encryption/decrypt-failed', 'KMS Decrypt returned empty plaintext');
    const key = Buffer.from(response.Plaintext);
    response.Plaintext.fill(0);
    return key;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const { client, sdk } = await this.load();
      await client.send(new sdk.DescribeKeyCommand({ KeyId: this.options.keyId }));
      return true;
    } catch {
      return false;
    }
  }
}
