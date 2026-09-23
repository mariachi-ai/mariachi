import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt } from 'node:crypto';
import { ConfigError, EncryptionError } from '@mariachi/core';
import { EncryptionAdapter, type DataKey } from '../adapter';
import { IV_LENGTH, KEY_LENGTH, TAG_LENGTH } from '../envelope';

const MIN_PASSPHRASE_LENGTH = 32;

function scryptAsync(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, KEY_LENGTH, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/**
 * Local key provider for development and self-hosted deployments.
 *
 * Each configured key is either a base64-encoded 32-byte key (preferred, see
 * `generateLocalKey()`) or a passphrase of at least 32 characters, which is
 * stretched once with scrypt. Data keys are wrapped with AES-256-GCM.
 *
 * Rotation: add a new key id, make it `activeKeyId`, keep the old key until
 * `Encryption.reEncrypt` has migrated existing values.
 */
export class LocalAdapter extends EncryptionAdapter {
  readonly name = 'local';
  private readonly secrets: Map<string, string>;
  private readonly keks = new Map<string, Promise<Buffer>>();
  private readonly active: string;

  constructor(keys: Record<string, string> | string, activeKeyId?: string) {
    super();
    const entries = typeof keys === 'string' ? { default: keys } : keys;
    this.secrets = new Map(Object.entries(entries));
    if (this.secrets.size === 0) throw new ConfigError('encryption/missing-key', 'Local adapter requires at least one key');
    for (const [id, secret] of this.secrets) {
      if (!LocalAdapter.isRawKey(secret) && (!secret || secret.length < MIN_PASSPHRASE_LENGTH)) {
        throw new ConfigError(
          'encryption/weak-key',
          `Key "${id}" must be a base64 32-byte key or a passphrase of at least ${MIN_PASSPHRASE_LENGTH} characters`,
        );
      }
    }
    this.active = activeKeyId ?? [...this.secrets.keys()].at(-1)!;
    if (!this.secrets.has(this.active)) {
      throw new ConfigError('encryption/missing-key', `Active key "${this.active}" is not configured`);
    }
  }

  static isRawKey(secret: string): boolean {
    return /^[A-Za-z0-9+/_-]{43}=?$/.test(secret) && Buffer.from(secret, 'base64').length === KEY_LENGTH;
  }

  get activeKeyId(): string {
    return this.active;
  }

  private kek(keyId: string): Promise<Buffer> {
    const cached = this.keks.get(keyId);
    if (cached) return cached;
    const secret = this.secrets.get(keyId);
    if (!secret) {
      return Promise.reject(new EncryptionError('encryption/unknown-key', `No local key configured for id "${keyId}"`));
    }
    const derived = LocalAdapter.isRawKey(secret)
      ? Promise.resolve(Buffer.from(secret, 'base64'))
      : scryptAsync(secret, createHash('sha256').update(`mariachi:encryption:${keyId}`).digest());
    this.keks.set(keyId, derived);
    return derived;
  }

  async generateDataKey(): Promise<DataKey> {
    const kek = await this.kek(this.active);
    const plaintext = randomBytes(KEY_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', kek, iv, { authTagLength: TAG_LENGTH });
    cipher.setAAD(Buffer.from(this.active, 'utf8'));
    const wrapped = Buffer.concat([iv, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
    return { keyId: this.active, plaintext, wrapped };
  }

  async unwrapDataKey(keyId: string, wrapped: Buffer): Promise<Buffer> {
    const kek = await this.kek(keyId);
    if (wrapped.length !== IV_LENGTH + KEY_LENGTH + TAG_LENGTH) {
      throw new EncryptionError('encryption/invalid-ciphertext', 'Wrapped data key has the wrong length');
    }
    try {
      const iv = wrapped.subarray(0, IV_LENGTH);
      const tag = wrapped.subarray(wrapped.length - TAG_LENGTH);
      const body = wrapped.subarray(IV_LENGTH, wrapped.length - TAG_LENGTH);
      const decipher = createDecipheriv('aes-256-gcm', kek, iv, { authTagLength: TAG_LENGTH });
      decipher.setAAD(Buffer.from(keyId, 'utf8'));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]);
    } catch {
      throw new EncryptionError('encryption/decrypt-failed', 'Failed to unwrap data key');
    }
  }
}

/** Generates a random base64 32-byte key suitable for `LocalAdapter`. */
export function generateLocalKey(): string {
  return randomBytes(KEY_LENGTH).toString('base64');
}
