import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { EncryptionError } from '@mariachi/core';
import type { EncryptionAdapter } from './adapter';
import { IV_LENGTH, TAG_LENGTH, encodeHeader, isEnvelope, parse, serialize } from './envelope';

export interface EncryptOptions {
  /**
   * Associated data the ciphertext is bound to, e.g. `users:${id}:ssn`. Decryption
   * with different associated data fails, which prevents copying ciphertexts
   * between rows or columns.
   */
  aad?: string;
}

function aadBuffer(header: Buffer, aad?: string): Buffer {
  return aad ? Buffer.concat([header, Buffer.from(`\u0000${aad}`, 'utf8')]) : header;
}

/**
 * Envelope encryption facade. Every value gets a fresh data key and IV; the data
 * key is wrapped by the adapter's key-encryption key.
 *
 * ```ts
 * const encryption = createEncryption({ adapter: 'local', keys: { k1: secret } });
 * const ct = await encryption.encrypt(ssn, { aad: `users:${id}:ssn` });
 * const pt = await encryption.decrypt(ct, { aad: `users:${id}:ssn` });
 * if (encryption.needsRotation(ct)) await save(await encryption.reEncrypt(ct, opts));
 * ```
 */
export class Encryption {
  constructor(private readonly adapter: EncryptionAdapter) {}

  get adapterName(): string {
    return this.adapter.name;
  }

  get activeKeyId(): string {
    return this.adapter.activeKeyId;
  }

  async encryptBuffer(plaintext: Buffer | Uint8Array, options: EncryptOptions = {}): Promise<string> {
    const dataKey = await this.adapter.generateDataKey();
    try {
      const header = encodeHeader(dataKey.keyId, dataKey.wrapped);
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv('aes-256-gcm', dataKey.plaintext, iv, { authTagLength: TAG_LENGTH });
      cipher.setAAD(aadBuffer(header, options.aad));
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      return serialize(header, iv, cipher.getAuthTag(), ciphertext);
    } finally {
      dataKey.plaintext.fill(0);
    }
  }

  async decryptBuffer(value: string, options: EncryptOptions = {}): Promise<Buffer> {
    const env = parse(value);
    const key = await this.adapter.unwrapDataKey(env.keyId, Buffer.from(env.wrapped));
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, env.iv, { authTagLength: TAG_LENGTH });
      decipher.setAAD(aadBuffer(env.header, options.aad));
      decipher.setAuthTag(env.tag);
      return Buffer.concat([decipher.update(env.ciphertext), decipher.final()]);
    } catch (err) {
      if (err instanceof EncryptionError) throw err;
      throw new EncryptionError('encryption/decrypt-failed', 'Decryption failed: wrong key, associated data, or tampered ciphertext');
    } finally {
      key.fill(0);
    }
  }

  async encrypt(plaintext: string, options?: EncryptOptions): Promise<string> {
    return this.encryptBuffer(Buffer.from(plaintext, 'utf8'), options);
  }

  async decrypt(value: string, options?: EncryptOptions): Promise<string> {
    return (await this.decryptBuffer(value, options)).toString('utf8');
  }

  async encryptJson(value: unknown, options?: EncryptOptions): Promise<string> {
    return this.encrypt(JSON.stringify(value), options);
  }

  async decryptJson<T = unknown>(value: string, options?: EncryptOptions): Promise<T> {
    return JSON.parse(await this.decrypt(value, options)) as T;
  }

  /** Key id a ciphertext was written with. */
  keyIdOf(value: string): string {
    return parse(value).keyId;
  }

  /** True when the ciphertext was written with a key other than the active one. */
  needsRotation(value: string): boolean {
    return this.keyIdOf(value) !== this.adapter.activeKeyId;
  }

  /** Decrypts and re-encrypts under the active key. */
  async reEncrypt(value: string, options?: EncryptOptions): Promise<string> {
    const plaintext = await this.decryptBuffer(value, options);
    try {
      return await this.encryptBuffer(plaintext, options);
    } finally {
      plaintext.fill(0);
    }
  }

  isEncrypted(value: unknown): value is string {
    return isEnvelope(value);
  }

  isHealthy(): Promise<boolean> {
    return this.adapter.isHealthy();
  }
}
