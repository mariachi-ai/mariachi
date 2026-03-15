import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';
import { EncryptionAdapter } from '../adapter';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * AES-256-GCM encryption using a passphrase from environment variables.
 *
 * Key derivation: scrypt(passphrase, random salt, 32 bytes).
 * Each encryption generates a unique salt and IV.
 * Output format: base64(salt[16] + iv[16] + authTag[16] + ciphertext)
 */
export class LocalAdapter extends EncryptionAdapter {
  readonly name = 'local';
  private readonly passphrase: string;

  constructor(passphrase: string) {
    super();
    if (!passphrase || passphrase.length < 16) {
      throw new Error(
        'Encryption passphrase must be at least 16 characters. '
        + 'Set ENCRYPTION_KEY in your environment.',
      );
    }
    this.passphrase = passphrase;
  }

  private deriveKey(salt: Buffer): Buffer {
    return scryptSync(this.passphrase, salt, KEY_LENGTH);
  }

  async encrypt(plaintext: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const key = this.deriveKey(salt);
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();
    const packed = Buffer.concat([salt, iv, authTag, encrypted]);
    return packed.toString('base64');
  }

  async decrypt(ciphertext: string): Promise<string> {
    const packed = Buffer.from(ciphertext, 'base64');

    if (packed.length < SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      throw new Error('Invalid ciphertext: too short');
    }

    let offset = 0;
    const salt = packed.subarray(offset, offset + SALT_LENGTH);
    offset += SALT_LENGTH;

    const iv = packed.subarray(offset, offset + IV_LENGTH);
    offset += IV_LENGTH;

    const authTag = packed.subarray(offset, offset + AUTH_TAG_LENGTH);
    offset += AUTH_TAG_LENGTH;

    const encrypted = packed.subarray(offset);
    const key = this.deriveKey(salt);

    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}
