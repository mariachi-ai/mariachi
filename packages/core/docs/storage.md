# Storage

`@mariachi/storage` stores files on S3 (and S3-compatible services such as R2, MinIO or Spaces),
on local disk or in memory, behind one `StorageClient` interface.

## Wire it

```ts
import { DefaultStorage, createStorage } from '@mariachi/storage';

const client = createStorage(config.env === 'production'
  ? { adapter: 's3', bucket: 'app-uploads', region: 'eu-west-1', basePath: 'app' }
  : { adapter: 'local', basePath: './storage', signingSecret: config.storage.signingSecret, publicBaseUrl: '/api/storage' });
const storage = new DefaultStorage({ client, requireTenant: true }, instrumentation);
```

| Option | Adapters | Meaning |
| --- | --- | --- |
| `basePath` | all | Key prefix (S3, memory) or root directory (local). |
| `bucket`, `region`, `endpoint`, `forcePathStyle`, `credentials` | s3 | `endpoint` + `forcePathStyle: true` for MinIO and most S3-compatible services. |
| `useAcl`, `defaultAcl` | s3 | Send per-object ACLs. Off by default: most buckets enforce bucket-owner ownership. |
| `publicBaseUrl` | s3, local | Base of `publicUrl` (a CDN, say). For local, the path where signed URLs are served. |
| `signingSecret` | local | HMAC secret for local signed URLs. Required for `signedUrl` and `signedUploadUrl`. |

## Keys

Keys are relative paths. `..`, a leading `/`, backslashes and control characters are rejected
(`storage/path-traversal`, `storage/invalid-key`), on every adapter. Build tenant-scoped keys
with `storage.tenantKey(ctx, 'invoices', id, 'pdf')` → `tenants/<tenantId>/invoices/<id>/pdf`;
with `requireTenant: true` it refuses a context without a tenant.

## Read and write

```ts
await storage.putValidated(ctx, key, file, {
  contentType: 'image/png',
  validation: { maxSizeBytes: 5 * 1024 * 1024, allowedMimeTypes: ['image/png', 'image/jpeg'], sniffContent: true },
});
await storage.putStream(ctx, key, readable, { contentType: 'video/mp4' });   // S3: multipart, 5 MiB parts
const body = await storage.getStream(ctx, key);                           // null when missing
await storage.copy(ctx, from, to);                                        // storage/not-found when `from` is missing
```

`sniffContent` checks the file's magic bytes against the declared type, so a script renamed to
`.png` is refused (`storage/invalid-mime-type`). Deleting a missing object isn't an error.

## Browser uploads and downloads

```ts
const uploadUrl = await storage.signedUploadUrl(ctx, key, { contentType: 'application/pdf', expiresIn: 300 });
// the browser PUTs the file to uploadUrl
const downloadUrl = await storage.signedUrl(ctx, key, { expiresIn: 600, downloadAs: 'invoice.pdf' });
```

On S3 these are presigned S3 URLs. The local adapter signs its own URLs (HMAC over method, key and
expiry), and your API serves them. Mount this controller at the adapter's `publicBaseUrl`:

```ts
import { httpResponse } from '@mariachi/server';
import { handleSignedLocalRequest, type LocalStorageAdapter } from '@mariachi/storage';

export class SignedStorageController extends BaseController {
  readonly prefix = 'storage';                            // publicBaseUrl: '/api/storage'
  constructor(private readonly local: LocalStorageAdapter) { super(); }
  init(): void {
    const serve = async (ctx: HttpContext) => {
      const res = await handleSignedLocalRequest(this.local, { method: ctx.request.method, url: ctx.request.url, body: ctx.request.rawBody });
      return httpResponse(res.status, res.body, res.headers);
    };
    this.get('*', { auth: false }, serve);                // the signature is the authorization
    this.put('*', { auth: false, bodyLimitBytes: 25 * 1024 * 1024 }, serve);
  }
}
```

A URL signed for upload can't be used to read, and a tampered or expired URL returns 403
(`storage/invalid-signature`). Uploads use `ctx.request.rawBody`, so the stored file is exactly
the bytes the client sent, whatever its content type.

## Errors

`StorageError`: `storage/not-found` (404), `storage/invalid-key` and `storage/path-traversal`
(400), `storage/tenant-required`, `storage/file-too-large` (413), `storage/invalid-mime-type`
(415), `storage/invalid-signature` (403), `storage/not-supported`, and `storage/read-failed`,
`storage/write-failed` or `storage/delete-failed` when the provider call fails.
