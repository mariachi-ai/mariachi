# @mariachi/encryption

Field-level encryption for sensitive data stored in the database (tokens, API keys, secrets).

The package exposes a single `Encryption` class with `encrypt()` and `decrypt()`. Underneath, an abstract `EncryptionAdapter` base class defines how encryption backends are implemented. The package ships with three adapters; you can add your own by extending the base class.

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Encryption   (public API: encrypt / decrypt)    │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  EncryptionAdapter  (abstract base class)  │  │
│  │                                            │  │
│  │  ┌─────────┐  ┌──────────┐  ┌──────────┐  │  │
│  │  │  Local   │  │ AWS KMS  │  │ GCP KMS  │  │  │
│  │  └─────────┘  └──────────┘  └──────────┘  │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

- **`Encryption`** — the public facade. Consumers only interact with this.
- **`EncryptionAdapter`** — abstract class that adapter authors extend.
- **`LocalAdapter`**, **`AwsKmsAdapter`**, **`GcpKmsAdapter`** — built-in implementations.
- **`createEncryption(config)`** — factory that picks the adapter from config and wraps it in `Encryption`.

## Quick start

```ts
import { createEncryption } from '@mariachi/encryption';

const encryption = createEncryption({
  adapter: process.env.NODE_ENV === 'production' ? 'aws-kms' : 'local',
  encryptionKey: process.env.ENCRYPTION_KEY,   // local
  awsKmsKeyId: process.env.AWS_KMS_KEY_ID,     // aws-kms
});

const ciphertext = await encryption.encrypt('my-secret-token');
const plaintext  = await encryption.decrypt(ciphertext);
```

## Choosing an adapter

**When implementing this for a project, ask the user which adapter they want for each environment** (local dev, staging, production). Do not assume — the choice depends on infrastructure and compliance requirements.

| Adapter | Best for | Install | Required config |
|---------|----------|---------|-----------------|
| `local` | Dev, single-instance, self-hosted | (none — uses Node crypto) | `encryptionKey` (≥ 16 chars) |
| `aws-kms` | Production on AWS | `pnpm add @aws-sdk/client-kms` | `awsKmsKeyId`, optional `awsRegion` |
| `gcp-kms` | Production on GCP | `pnpm add @google-cloud/kms` | `gcpKmsKeyName` (full resource name) |

### Local adapter

- **Algorithm:** AES-256-GCM, key derived via scrypt
- **Use when:** Local development, single-server self-hosted, no cloud dependency
- **Trade-off:** Key rotation requires re-encrypting all data

### AWS KMS adapter

- **Pattern:** Envelope encryption (GenerateDataKey → local AES → store encrypted DEK)
- **Use when:** Multi-instance production on AWS, compliance requires HSM-backed keys
- **IAM permissions:** `kms:GenerateDataKey`, `kms:Decrypt` on the key
- **Trade-off:** Adds latency per encrypt/decrypt (KMS API call)

### GCP KMS adapter

- **Pattern:** Envelope encryption (local DEK → KMS Encrypt to wrap → store wrapped DEK)
- **Use when:** Multi-instance production on GCP
- **Permissions:** `cloudkms.cryptoKeyVersions.useToEncrypt`, `cloudkms.cryptoKeyVersions.useToDecrypt`
- **Trade-off:** Same latency trade-off as AWS KMS

## Adding a custom adapter

Extend `EncryptionAdapter` and implement `encrypt` / `decrypt`:

```ts
import { EncryptionAdapter } from '@mariachi/encryption';

export class VaultAdapter extends EncryptionAdapter {
  readonly name = 'vault';

  constructor(private vaultUrl: string, private transitKey: string) {
    super();
  }

  async encrypt(plaintext: string): Promise<string> {
    // Call HashiCorp Vault Transit encrypt API
  }

  async decrypt(ciphertext: string): Promise<string> {
    // Call HashiCorp Vault Transit decrypt API
  }
}
```

Then either:
- Add it to `createEncryption()` by extending the config and switch (in a fork or PR), or
- Instantiate it directly and pass to `new Encryption(adapter)`:

```ts
import { Encryption } from '@mariachi/encryption';
import { VaultAdapter } from './my-vault-adapter';

const encryption = new Encryption(new VaultAdapter(url, key));
```

## Config

```ts
interface EncryptionConfig {
  adapter: 'local' | 'aws-kms' | 'gcp-kms';
  encryptionKey?: string;      // required for 'local'
  awsKmsKeyId?: string;        // required for 'aws-kms'
  awsRegion?: string;          // optional for 'aws-kms'
  gcpKmsKeyName?: string;      // required for 'gcp-kms'
}
```

## Environment variables

| Variable | Used by | Required | Description |
|----------|---------|----------|-------------|
| `ENCRYPTION_KEY` | `local` | Yes (for local) | Passphrase for AES key derivation (≥ 16 chars) |
| `AWS_KMS_KEY_ID` | `aws-kms` | Yes (for aws-kms) | KMS key ARN, alias ARN, key ID, or alias name |
| `AWS_REGION` | `aws-kms` | No | AWS region (default: `us-east-1`) |
| `GCP_KMS_KEY_NAME` | `gcp-kms` | Yes (for gcp-kms) | Full CryptoKey resource name |
| `NODE_ENV` | factory | No | Commonly used to decide adapter |

## Errors

All errors are `EncryptionError` from `@mariachi/core`:

| Code | When |
|------|------|
| `encryption/missing-key` | `local` adapter without `encryptionKey` |
| `encryption/missing-kms-key` | `aws-kms` adapter without `awsKmsKeyId` |
| `encryption/missing-gcp-key` | `gcp-kms` adapter without `gcpKmsKeyName` |
| `encryption/unknown-adapter` | Unrecognized adapter name |

## Usage conventions

Follow the Mariachi pattern — use `createEncryption()`, don't instantiate adapters directly:

```ts
// CORRECT
const encryption = createEncryption({ adapter: 'local', encryptionKey: key });

// WRONG — don't bypass the factory in app code
const adapter = new LocalAdapter(key);
```

The `Encryption` instance is created once during app bootstrap and injected into services that store sensitive data.
