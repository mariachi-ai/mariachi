import type { EncryptionAdapter } from './adapter';

/**
 * Public encryption facade.
 *
 * Wraps an `EncryptionAdapter` and exposes a simple `encrypt` / `decrypt`
 * API. Consumers use this class; they never interact with adapters directly.
 *
 * ```ts
 * const encryption = createEncryption({ adapter: 'local', encryptionKey: '...' });
 * const ciphertext = await encryption.encrypt('secret');
 * const plaintext  = await encryption.decrypt(ciphertext);
 * ```
 */
export class Encryption {
  constructor(private readonly adapter: EncryptionAdapter) {}

  /** The name of the underlying adapter (e.g. "local", "aws-kms"). */
  get adapterName(): string {
    return this.adapter.name;
  }

  /** Encrypt a plaintext string. Returns an opaque ciphertext safe to store. */
  async encrypt(plaintext: string): Promise<string> {
    return this.adapter.encrypt(plaintext);
  }

  /** Decrypt a ciphertext back to the original plaintext. */
  async decrypt(ciphertext: string): Promise<string> {
    return this.adapter.decrypt(ciphertext);
  }
}
