import { Readable } from 'node:stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { ConfigError, StorageError } from '@mariachi/core';
import { normalizeKey, normalizePrefix } from '../keys';
import type {
  ListOptions,
  ListResult,
  ObjectInfo,
  PutOptions,
  SignedUploadOptions,
  SignedUrlOptions,
  StorageClient,
  StorageConfig,
} from '../types';

const MAX_EXPIRES = 7 * 24 * 3600;

function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'NoSuchKey' || e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404;
}

function wrap(operation: string, key: string, err: unknown): StorageError {
  return new StorageError(`storage/${operation}-failed`, `S3 ${operation} failed for ${key}`, {
    cause: err instanceof Error ? err.message : String(err),
  });
}

export class S3StorageAdapter implements StorageClient {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly prefix: string;
  private readonly useAcl: boolean;
  private readonly defaultAcl: string;
  private readonly publicBaseUrl: string;

  constructor(config: StorageConfig, client?: S3Client) {
    if (!config.bucket || !config.region) {
      throw new ConfigError('storage/invalid-config', 'S3 adapter requires bucket and region');
    }
    this.client =
      client ??
      new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        forcePathStyle: config.forcePathStyle,
        credentials: config.credentials,
      });
    this.bucket = config.bucket;
    this.region = config.region;
    this.prefix = normalizePrefix(config.basePath);
    this.useAcl = config.useAcl ?? false;
    this.defaultAcl = config.defaultAcl ?? 'private';
    this.publicBaseUrl = (
      config.publicBaseUrl ??
      (config.endpoint
        ? `${config.endpoint.replace(/\/+$/, '')}/${this.bucket}`
        : `https://${this.bucket}.s3.${this.region}.amazonaws.com`)
    ).replace(/\/+$/, '');
  }

  private fullKey(key: string): string {
    return `${this.prefix}${normalizeKey(key)}`;
  }

  private stripPrefix(fullKey: string): string {
    return fullKey.startsWith(this.prefix) ? fullKey.slice(this.prefix.length) : fullKey;
  }

  async put(key: string, data: Buffer | Uint8Array | string, options: PutOptions = {}): Promise<void> {
    const body = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.fullKey(key),
          Body: body,
          ACL: this.aclFor(options),
          ContentType: options.contentType,
          ContentDisposition: options.contentDisposition,
          CacheControl: options.cacheControl,
          Metadata: options.metadata,
        }),
      );
    } catch (err) {
      throw wrap('write', key, err);
    }
  }

  private aclFor(options: PutOptions): 'private' | 'public-read' | 'authenticated-read' | undefined {
    if (!this.useAcl) return undefined;
    if (options.acl) return options.acl;
    if (options.access === 'public') return 'public-read';
    return this.defaultAcl as 'private' | 'public-read' | 'authenticated-read';
  }

  /**
   * Streams with a multipart `Upload`: `PutObject` needs a Content-Length, which a stream of
   * unknown size doesn't have. Parts are 5 MiB, so memory stays bounded for large files.
   */
  async putStream(key: string, body: Readable, options: PutOptions = {}): Promise<void> {
    try {
      await new Upload({
        client: this.client,
        params: {
          Bucket: this.bucket,
          Key: this.fullKey(key),
          Body: body,
          ACL: this.aclFor(options),
          ContentType: options.contentType,
          ContentDisposition: options.contentDisposition,
          CacheControl: options.cacheControl,
          Metadata: options.metadata,
        },
        queueSize: 4,
        partSize: 5 * 1024 * 1024,
      }).done();
    } catch (err) {
      throw wrap('write', key, err);
    }
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.fullKey(key) }));
      if (!response.Body) return null;
      return Buffer.from(await response.Body.transformToByteArray());
    } catch (err) {
      if (isNotFound(err)) return null;
      throw wrap('read', key, err);
    }
  }

  async getStream(key: string): Promise<Readable | null> {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.fullKey(key) }));
      const body = response.Body;
      if (!body) return null;
      if (body instanceof Readable) return body;
      if (typeof (body as { transformToWebStream?: () => ReadableStream }).transformToWebStream === 'function') {
        return Readable.fromWeb((body as { transformToWebStream: () => ReadableStream }).transformToWebStream());
      }
      return Readable.from(Buffer.from(await body.transformToByteArray()));
    } catch (err) {
      if (isNotFound(err)) return null;
      throw wrap('read', key, err);
    }
  }

  async head(key: string): Promise<ObjectInfo | null> {
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.fullKey(key) }));
      return {
        key,
        size: r.ContentLength ?? 0,
        contentType: r.ContentType,
        lastModified: r.LastModified,
        etag: r.ETag,
        metadata: r.Metadata,
      };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw wrap('read', key, err);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.fullKey(key) }));
    } catch (err) {
      if (!isNotFound(err)) throw wrap('delete', key, err);
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  async copy(from: string, to: string): Promise<void> {
    const source = `${this.bucket}/${this.fullKey(from).split('/').map(encodeURIComponent).join('/')}`;
    try {
      await this.client.send(new CopyObjectCommand({ Bucket: this.bucket, Key: this.fullKey(to), CopySource: source }));
    } catch (err) {
      if (isNotFound(err)) throw new StorageError('storage/not-found', `Object ${from} not found`);
      throw wrap('copy', from, err);
    }
  }

  async list(prefix: string, options: ListOptions = {}): Promise<ListResult> {
    try {
      const r = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: `${this.prefix}${normalizePrefix(prefix)}`,
          MaxKeys: Math.min(Math.max(options.limit ?? 100, 1), 1000),
          ContinuationToken: options.cursor,
        }),
      );
      return {
        objects: (r.Contents ?? []).map((o) => ({
          key: this.stripPrefix(o.Key ?? ''),
          size: o.Size ?? 0,
          lastModified: o.LastModified,
          etag: o.ETag,
        })),
        nextCursor: r.IsTruncated ? (r.NextContinuationToken ?? null) : null,
      };
    } catch (err) {
      throw wrap('list', prefix, err);
    }
  }

  async signedUrl(key: string, options: SignedUrlOptions = {}): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: this.fullKey(key),
      ResponseContentDisposition: options.downloadAs
        ? `attachment; filename="${options.downloadAs.replace(/["\\\r\n]/g, '_')}"`
        : undefined,
    });
    return getSignedUrl(this.client, command, { expiresIn: Math.min(options.expiresIn ?? 3600, MAX_EXPIRES) });
  }

  async signedUploadUrl(key: string, options: SignedUploadOptions = {}): Promise<string> {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: this.fullKey(key), ContentType: options.contentType });
    return getSignedUrl(this.client, command, { expiresIn: Math.min(options.expiresIn ?? 900, MAX_EXPIRES) });
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${this.fullKey(key).split('/').map(encodeURIComponent).join('/')}`;
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }
}
