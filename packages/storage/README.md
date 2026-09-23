# @mariachi/storage

Object storage on S3 and S3-compatible services (R2, MinIO, Spaces), local disk or memory, with
path-safe keys, tenant key prefixes, upload validation, streaming, presigned uploads and signed
download URLs, including for the local adapter.

**Status: beta.** Covered by unit tests, a MinIO integration test and the storage contract suite.
The API can change before 1.0.

Guide: [storage.md](../core/docs/storage.md)

## Public API

| Export | Purpose |
| --- | --- |
| `createStorage(config)` | `S3StorageAdapter`, `LocalStorageAdapter` or `MemoryStorageAdapter` |
| `DefaultStorage` | `put`, `putValidated`, `putStream`, `get`, `getStream`, `getOrThrow`, `head`, `exists`, `delete`, `copy`, `move`, `list`, `signedUrl`, `signedUploadUrl`, `publicUrl`, `key`, `tenantKey` |
| `handleSignedLocalRequest(adapter, request)` | Serves local signed URLs from a controller |
| `normalizeKey`, `buildKey`, `sniffContentType`, `contentMatchesType` | Key safety and content sniffing |

## Config

| Option | Env | Adapters | Notes |
| --- | --- | --- | --- |
| `adapter` | `STORAGE_ADAPTER` | | `'s3'`, `'local'` or `'memory'` |
| `basePath` | `STORAGE_BASE_PATH` | all | Key prefix, or the local root directory |
| `bucket`, `region` | `STORAGE_BUCKET`, `STORAGE_REGION`/`AWS_REGION` | s3 | Required for S3 |
| `endpoint`, `forcePathStyle`, `credentials` | | s3 | For S3-compatible services |
| `useAcl`, `defaultAcl` | | s3 | Per-object ACLs, off by default |
| `publicBaseUrl` | | s3, local | CDN base, or where local signed URLs are served |
| `signingSecret` | | local | Required for local signed URLs |

`DefaultStorage` also takes `requireTenant` (refuse `tenantKey` without `ctx.tenantId`). Errors are
`StorageError`.
