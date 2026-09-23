export type StorageAdapterName = 's3' | 'local' | 'memory';

export interface StorageConfig {
  adapter: StorageAdapterName;
  /** Key prefix (S3/memory) or root directory (local). */
  basePath?: string;

  // S3 and S3-compatible (R2, MinIO, Spaces)
  bucket?: string;
  region?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  credentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
  /** Send per-object ACLs. Off by default: most buckets enforce "bucket owner" ownership. */
  useAcl?: boolean;
  /** Canned ACL used when `useAcl` is on and the put does not set `acl` or `access`. */
  defaultAcl?: CannedAcl;
  /** Base URL for public objects, e.g. a CDN. Defaults to the virtual-hosted S3 URL. */
  publicBaseUrl?: string;

  // local
  /** Secret used to sign local URLs. Required for `signedUrl` on the local adapter. */
  signingSecret?: string;
}

import type { Readable } from 'node:stream';

export type AccessControl = 'public' | 'private';
export type CannedAcl = 'private' | 'public-read' | 'authenticated-read';

export interface PutOptions {
  access?: AccessControl;
  /** Overrides `access` when the adapter sends object ACLs. */
  acl?: CannedAcl;
  contentType?: string;
  contentDisposition?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface SignedUrlOptions {
  /** Seconds until the URL expires. Default 3600, max 7 days. */
  expiresIn?: number;
  /** Forces a download filename via Content-Disposition. */
  downloadAs?: string;
}

export interface SignedUploadOptions {
  expiresIn?: number;
  contentType?: string;
}

export interface ObjectInfo {
  key: string;
  size: number;
  contentType?: string;
  lastModified?: Date;
  etag?: string;
  metadata?: Record<string, string>;
}

export interface ListOptions {
  limit?: number;
  cursor?: string;
}

export interface ListResult {
  objects: ObjectInfo[];
  nextCursor: string | null;
}

export interface UploadValidation {
  maxSizeBytes?: number;
  allowedMimeTypes?: string[];
  /** Verify the declared content type against the file's magic bytes. */
  sniffContent?: boolean;
}

export interface StorageClient {
  put(key: string, data: Buffer | Uint8Array | string, options?: PutOptions): Promise<void>;
  putStream(key: string, body: Readable, options?: PutOptions): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  getStream(key: string): Promise<Readable | null>;
  head(key: string): Promise<ObjectInfo | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  copy(from: string, to: string): Promise<void>;
  list(prefix: string, options?: ListOptions): Promise<ListResult>;
  signedUrl(key: string, options?: SignedUrlOptions): Promise<string>;
  signedUploadUrl(key: string, options?: SignedUploadOptions): Promise<string>;
  publicUrl(key: string): string;
  isHealthy(): Promise<boolean>;
}
