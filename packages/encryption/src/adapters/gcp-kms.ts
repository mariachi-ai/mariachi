import { randomBytes } from 'node:crypto';
import { ConfigError, EncryptionError } from '@mariachi/core';
import { EncryptionAdapter, type DataKey } from '../adapter';
import { KEY_LENGTH } from '../envelope';

interface GcpKmsLikeClient {
  encrypt(req: { name: string; plaintext: Buffer; additionalAuthenticatedData?: Buffer }): Promise<[{ ciphertext?: Uint8Array | string | null }]>;
  decrypt(req: { name: string; ciphertext: Buffer; additionalAuthenticatedData?: Buffer }): Promise<[{ plaintext?: Uint8Array | string | null }]>;
  getCryptoKey?(req: { name: string }): Promise<unknown>;
}

export interface GcpKmsOptions {
  /** `projects/{p}/locations/{l}/keyRings/{r}/cryptoKeys/{k}` */
  keyName: string;
  client?: GcpKmsLikeClient;
}

function toBuffer(value: Uint8Array | string | null | undefined): Buffer | null {
  if (!value) return null;
  return typeof value === 'string' ? Buffer.from(value, 'base64') : Buffer.from(value);
}

/**
 * Google Cloud KMS key provider. Data keys are generated locally and wrapped with
 * `encrypt`; GCP picks the right key version on `decrypt`.
 *
 * Requires `@google-cloud/kms` as a peer dependency.
 */
export class GcpKmsAdapter extends EncryptionAdapter {
  readonly name = 'gcp-kms';
  private readonly keyName: string;
  private client?: GcpKmsLikeClient;

  constructor(options: GcpKmsOptions) {
    super();
    if (!options.keyName) throw new ConfigError('encryption/missing-gcp-key', 'GCP KMS adapter requires keyName');
    this.keyName = options.keyName;
    this.client = options.client;
  }

  get activeKeyId(): string {
    return this.keyName;
  }

  private async getClient(): Promise<GcpKmsLikeClient> {
    if (this.client) return this.client;
    try {
      const { KeyManagementServiceClient } = await import('@google-cloud/kms');
      this.client = new KeyManagementServiceClient() as unknown as GcpKmsLikeClient;
      return this.client;
    } catch {
      throw new ConfigError('encryption/missing-dependency', 'GCP KMS adapter requires @google-cloud/kms');
    }
  }

  async generateDataKey(): Promise<DataKey> {
    const client = await this.getClient();
    const plaintext = randomBytes(KEY_LENGTH);
    try {
      const [response] = await client.encrypt({ name: this.keyName, plaintext });
      const wrapped = toBuffer(response.ciphertext);
      if (!wrapped) throw new EncryptionError('encryption/kms-failed', 'GCP KMS returned an empty ciphertext');
      return { keyId: this.keyName, plaintext, wrapped };
    } catch (err) {
      plaintext.fill(0);
      throw new EncryptionError('encryption/kms-failed', 'GCP KMS encrypt failed', { cause: (err as Error).message });
    }
  }

  async unwrapDataKey(keyId: string, wrapped: Buffer): Promise<Buffer> {
    const client = await this.getClient();
    try {
      const [response] = await client.decrypt({ name: keyId, ciphertext: wrapped });
      const key = toBuffer(response.plaintext);
      if (!key) throw new EncryptionError('encryption/kms-failed', 'GCP KMS returned an empty plaintext');
      if (response.plaintext && typeof response.plaintext !== 'string') response.plaintext.fill(0);
      return key;
    } catch (err) {
      throw new EncryptionError('encryption/decrypt-failed', 'GCP KMS decrypt failed', { cause: (err as Error).message });
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const client = await this.getClient();
      if (client.getCryptoKey) await client.getCryptoKey({ name: this.keyName });
      return true;
    } catch {
      return false;
    }
  }
}
