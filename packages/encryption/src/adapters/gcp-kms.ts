import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { EncryptionAdapter } from '../adapter';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const DEK_LENGTH = 32;

/**
 * Google Cloud KMS adapter using envelope encryption.
 *
 * Per-encrypt:
 *   1. Generate a random 256-bit DEK locally
 *   2. Encrypt data locally with the DEK (AES-256-GCM)
 *   3. Call GCP KMS to wrap (encrypt) the DEK
 *   4. Store the wrapped DEK alongside the ciphertext
 *   5. Zero the plaintext DEK
 *
 * Per-decrypt:
 *   1. Extract wrapped DEK from blob
 *   2. Call GCP KMS to unwrap (decrypt) the DEK
 *   3. Decrypt payload locally
 *   4. Zero the plaintext DEK
 *
 * Output format: base64(wrappedDekLen[2] + wrappedDEK + iv[12] + authTag[16] + ciphertext)
 *
 * Requires `@google-cloud/kms` as a peer dependency.
 *
 * `keyName` must be the full CryptoKey resource name:
 * `projects/{project}/locations/{location}/keyRings/{ring}/cryptoKeys/{key}`
 */
export class GcpKmsAdapter extends EncryptionAdapter {
  readonly name = 'gcp-kms';
  private readonly keyName: string;
  private kmsClient: any;

  constructor(keyName: string) {
    super();
    this.keyName = keyName;
  }

  private async getClient() {
    if (this.kmsClient) return this.kmsClient;
    try {
      const { KeyManagementServiceClient } = await import('@google-cloud/kms');
      this.kmsClient = new KeyManagementServiceClient();
      return this.kmsClient;
    } catch {
      throw new Error(
        'GCP KMS adapter requires @google-cloud/kms. Install it: pnpm add @google-cloud/kms',
      );
    }
  }

  async encrypt(plaintext: string): Promise<string> {
    const client = await this.getClient();

    const plaintextDek = randomBytes(DEK_LENGTH);

    try {
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(ALGORITHM, plaintextDek, iv, {
        authTagLength: AUTH_TAG_LENGTH,
      });

      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      const [encryptResponse] = await client.encrypt({
        name: this.keyName,
        plaintext: plaintextDek,
      });

      const wrappedDek = Buffer.from(encryptResponse.ciphertext as Uint8Array);
      const wrappedDekLen = Buffer.alloc(2);
      wrappedDekLen.writeUInt16BE(wrappedDek.length, 0);

      const packed = Buffer.concat([wrappedDekLen, wrappedDek, iv, authTag, encrypted]);
      return packed.toString('base64');
    } finally {
      plaintextDek.fill(0);
    }
  }

  async decrypt(ciphertext: string): Promise<string> {
    const client = await this.getClient();
    const packed = Buffer.from(ciphertext, 'base64');

    if (packed.length < 2) {
      throw new Error('Invalid GCP KMS ciphertext: too short');
    }

    let offset = 0;
    const wrappedDekLen = packed.readUInt16BE(offset);
    offset += 2;

    if (packed.length < offset + wrappedDekLen + IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      throw new Error('Invalid GCP KMS ciphertext: truncated');
    }

    const wrappedDek = packed.subarray(offset, offset + wrappedDekLen);
    offset += wrappedDekLen;

    const iv = packed.subarray(offset, offset + IV_LENGTH);
    offset += IV_LENGTH;

    const authTag = packed.subarray(offset, offset + AUTH_TAG_LENGTH);
    offset += AUTH_TAG_LENGTH;

    const encrypted = packed.subarray(offset);

    const [decryptResponse] = await client.decrypt({
      name: this.keyName,
      ciphertext: wrappedDek,
    });

    const plaintextDek = Buffer.from(decryptResponse.plaintext as Uint8Array);

    try {
      const decipher = createDecipheriv(ALGORITHM, plaintextDek, iv, {
        authTagLength: AUTH_TAG_LENGTH,
      });
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } finally {
      plaintextDek.fill(0);
    }
  }
}
