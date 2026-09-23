export interface DataKey {
  /** Identifier of the key-encryption key that wrapped this data key. */
  keyId: string;
  /** 32-byte AES key. Callers zero it after use. */
  plaintext: Buffer;
  /** Data key encrypted by the KEK; stored alongside the ciphertext. */
  wrapped: Buffer;
}

/**
 * Key provider for envelope encryption. Implementations only manage data keys;
 * the payload is always encrypted locally with AES-256-GCM by `Encryption`.
 *
 * ```ts
 * export class VaultAdapter extends EncryptionAdapter {
 *   readonly name = 'vault';
 *   get activeKeyId() { return 'transit/app'; }
 *   async generateDataKey() { ... }
 *   async unwrapDataKey(keyId, wrapped) { ... }
 * }
 * ```
 */
export abstract class EncryptionAdapter {
  /** Short identifier for logging and config (e.g. "local", "aws-kms"). */
  abstract readonly name: string;

  /** Key id new ciphertexts are written with. Ciphertexts under other ids need rotation. */
  abstract get activeKeyId(): string;

  abstract generateDataKey(): Promise<DataKey>;

  abstract unwrapDataKey(keyId: string, wrapped: Buffer): Promise<Buffer>;

  isHealthy(): Promise<boolean> {
    return Promise.resolve(true);
  }
}
