import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { EncryptionAdapter } from '../adapter';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * AWS KMS adapter using envelope encryption.
 *
 * Per-encrypt:
 *   1. KMS.GenerateDataKey → plaintext DEK + encrypted DEK
 *   2. Encrypt data locally with the plaintext DEK (AES-256-GCM)
 *   3. Store encrypted DEK alongside the ciphertext
 *   4. Zero the plaintext DEK
 *
 * Per-decrypt:
 *   1. Extract encrypted DEK from blob
 *   2. KMS.Decrypt → recover plaintext DEK
 *   3. Decrypt payload locally
 *   4. Zero the plaintext DEK
 *
 * Output format: base64(encDekLen[2] + encryptedDEK + iv[12] + authTag[16] + ciphertext)
 *
 * Requires `@aws-sdk/client-kms` as a peer dependency.
 */
export class AwsKmsAdapter extends EncryptionAdapter {
  readonly name = 'aws-kms';
  private readonly keyId: string;
  private readonly region: string;
  private kmsClient: any;

  constructor(keyId: string, region?: string) {
    super();
    this.keyId = keyId;
    this.region = region ?? process.env.AWS_REGION ?? 'us-east-1';
  }

  private async getClient() {
    if (this.kmsClient) return this.kmsClient;
    try {
      const { KMSClient } = await import('@aws-sdk/client-kms');
      this.kmsClient = new KMSClient({ region: this.region });
      return this.kmsClient;
    } catch {
      throw new Error(
        'AWS KMS adapter requires @aws-sdk/client-kms. Install it: pnpm add @aws-sdk/client-kms',
      );
    }
  }

  async encrypt(plaintext: string): Promise<string> {
    const client = await this.getClient();
    const { GenerateDataKeyCommand } = await import('@aws-sdk/client-kms');

    const { CiphertextBlob: encryptedDek, Plaintext: plaintextDek } =
      await client.send(
        new GenerateDataKeyCommand({
          KeyId: this.keyId,
          KeySpec: 'AES_256',
        }),
      );

    if (!plaintextDek || !encryptedDek) {
      throw new Error('KMS GenerateDataKey returned empty key material');
    }

    try {
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(
        ALGORITHM,
        Buffer.from(plaintextDek),
        iv,
        { authTagLength: AUTH_TAG_LENGTH },
      );

      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      const encDekBuf = Buffer.from(encryptedDek);
      const encDekLen = Buffer.alloc(2);
      encDekLen.writeUInt16BE(encDekBuf.length, 0);

      const packed = Buffer.concat([encDekLen, encDekBuf, iv, authTag, encrypted]);
      return packed.toString('base64');
    } finally {
      Buffer.from(plaintextDek).fill(0);
    }
  }

  async decrypt(ciphertext: string): Promise<string> {
    const client = await this.getClient();
    const { DecryptCommand } = await import('@aws-sdk/client-kms');
    const packed = Buffer.from(ciphertext, 'base64');

    if (packed.length < 2) {
      throw new Error('Invalid KMS ciphertext: too short');
    }

    let offset = 0;
    const encDekLen = packed.readUInt16BE(offset);
    offset += 2;

    if (packed.length < offset + encDekLen + IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      throw new Error('Invalid KMS ciphertext: truncated');
    }

    const encryptedDek = packed.subarray(offset, offset + encDekLen);
    offset += encDekLen;

    const iv = packed.subarray(offset, offset + IV_LENGTH);
    offset += IV_LENGTH;

    const authTag = packed.subarray(offset, offset + AUTH_TAG_LENGTH);
    offset += AUTH_TAG_LENGTH;

    const encrypted = packed.subarray(offset);

    const { Plaintext: plaintextDek } = await client.send(
      new DecryptCommand({ CiphertextBlob: encryptedDek }),
    );

    if (!plaintextDek) {
      throw new Error('KMS Decrypt returned empty plaintext');
    }

    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        Buffer.from(plaintextDek),
        iv,
        { authTagLength: AUTH_TAG_LENGTH },
      );
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } finally {
      Buffer.from(plaintextDek).fill(0);
    }
  }
}
