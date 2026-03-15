/**
 * Abstract base class for encryption adapters.
 *
 * Extend this class to implement a new encryption backend.
 * Each adapter must implement `encrypt()` and `decrypt()`.
 *
 * Example:
 *
 * ```ts
 * export class VaultAdapter extends EncryptionAdapter {
 *   readonly name = 'vault';
 *
 *   async encrypt(plaintext: string): Promise<string> {
 *     // Call Vault Transit API …
 *   }
 *
 *   async decrypt(ciphertext: string): Promise<string> {
 *     // Call Vault Transit API …
 *   }
 * }
 * ```
 */
export abstract class EncryptionAdapter {
  /** Short identifier for logging and config (e.g. "local", "aws-kms"). */
  abstract readonly name: string;

  /** Encrypt a plaintext string into an opaque ciphertext (safe to store). */
  abstract encrypt(plaintext: string): Promise<string>;

  /** Decrypt a ciphertext back to the original plaintext. */
  abstract decrypt(ciphertext: string): Promise<string>;
}
