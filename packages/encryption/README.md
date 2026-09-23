# @mariachi/encryption

Envelope encryption for fields and blobs at rest. Every value gets a fresh 256-bit data key and IV and
is sealed with AES-256-GCM. The data key is wrapped by a key-encryption key (KEK) held locally, in AWS
KMS, or in GCP KMS. Only the wrapped data key is stored, inside the ciphertext.

## Usage

```ts
import { createEncryption, generateLocalKey } from '@mariachi/encryption';

const encryption = createEncryption(
  config.env === 'production'
    ? { adapter: 'aws-kms', awsKmsKeyId: 'alias/app-data', awsRegion: 'eu-west-1' }
    : { adapter: 'local', keys: { k1: localKey } },       // localKey = generateLocalKey(), kept in secrets
);

const aad = `users:${user.id}:ssn`;
const stored = await encryption.encrypt(ssn, { aad });    // 'mx1:...'
const ssn2 = await encryption.decrypt(stored, { aad });

await encryption.encryptJson({ iban, bic }, { aad: `accounts:${id}:bank` });
await encryption.decryptJson<{ iban: string; bic: string }>(value, { aad: `accounts:${id}:bank` });
await encryption.encryptBuffer(fileBytes);                // and decryptBuffer
```

**Always pass `aad`** (associated data) naming the row and column. Decryption with different
associated data fails, so a ciphertext copied into another user's row or another column can't be
decrypted there.

## Format

```
mx1:<base64url( version[1] | keyIdLen[2] | keyId | wrappedLen[2] | wrappedDataKey | iv[12] | tag[16] | ciphertext )>
```

Everything before the IV, including the key id and the wrapped key, is authenticated together with
your `aad`, so none of it can be altered or swapped. `isEncrypted(value)` checks for the `mx1:`
prefix, and `encryption.keyIdOf(value)` returns the key id a value was written with.

## Providers

| Adapter | KEK lives in | Config | Notes |
| --- | --- | --- | --- |
| `local` | process memory | `keys: { id: key }`, `activeKeyId?` | Keys are base64 32-byte keys (`generateLocalKey()`) or passphrases of at least 32 characters, stretched once with scrypt. For development and self-hosting. |
| `aws-kms` | AWS KMS | `awsKmsKeyId`, `awsRegion?`, `encryptionContext?` | `GenerateDataKey` / `Decrypt`. Requires the optional peer `@aws-sdk/client-kms`. |
| `gcp-kms` | GCP KMS | `gcpKmsKeyName` (full CryptoKey resource name) | Requires the optional peer `@google-cloud/kms`. |
| `custom` | anywhere | `instance: EncryptionAdapter` | Implement `generateDataKey()` and `unwrapDataKey(keyId, wrapped)`. |

With KMS, the plaintext KEK never leaves the KMS. Each `encrypt` makes one KMS call and each
`decrypt` makes one unwrap call; cache decrypted values in memory if a hot path decrypts the same
value repeatedly.

## Key rotation

1. Add a new key and make it active: `keys: { k1: old, k2: new }, activeKeyId: 'k2'`. For KMS, rotate
   the key in KMS; old versions stay usable for decryption.
2. New writes use `k2`. Old values still decrypt, because the key id is inside each ciphertext.
3. Backfill in a job: `if (encryption.needsRotation(value)) value = await encryption.reEncrypt(value, { aad })`.
4. When nothing references `k1`, remove it.

## Errors

Failures throw `EncryptionError` (or `ConfigError` at construction):

- `encryption/decrypt-failed`: wrong key, wrong `aad`, or tampered data.
- `encryption/invalid-ciphertext`: the value isn't an `mx1:` envelope.
- `encryption/unknown-key`: the ciphertext's key id isn't configured.
- `encryption/kms-failed`: the KMS call failed.
- `encryption/missing-key`, `encryption/weak-key`, `encryption/missing-kms-key`,
  `encryption/missing-gcp-key`, `encryption/missing-dependency` (optional peer not installed),
  `encryption/unknown-adapter`: configuration errors.

Messages never include plaintext or key material.
