import type { Readable } from 'node:stream';
import type { Context, Instrumentable, Logger, MetricsAdapter, TracerAdapter } from '@mariachi/core';
import { StorageError, resolveInstrumentation, withSpan, type InstrumentationDeps } from '@mariachi/core';
import { buildKey, normalizeKey } from './keys';
import { contentMatchesType } from './sniff';
import type {
  ListOptions,
  ListResult,
  ObjectInfo,
  PutOptions,
  SignedUploadOptions,
  SignedUrlOptions,
  StorageClient,
  UploadValidation,
} from './types';

export interface StorageServiceConfig {
  client: StorageClient;
  /**
   * When true, `tenantKey` refuses contexts without a tenant. Keys produced by
   * `tenantKey` are always `tenants/<tenantId>/...`.
   */
  requireTenant?: boolean;
}

function byteLength(data: Buffer | Uint8Array | string): number {
  return typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength;
}

export abstract class Storage implements Instrumentable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly client: StorageClient;
  protected readonly requireTenant: boolean;

  constructor(config: StorageServiceConfig, instrumentation?: InstrumentationDeps) {
    const resolved = resolveInstrumentation(instrumentation);
    this.logger = resolved.logger;
    this.tracer = resolved.tracer;
    this.metrics = resolved.metrics;
    this.client = config.client;
    this.requireTenant = config.requireTenant ?? true;
  }

  /** Builds a key from single-component segments, e.g. `key('avatars', userId, 'original.png')`. */
  key(...segments: Array<string | number | undefined | null>): string {
    return buildKey(...segments);
  }

  /** Builds a key namespaced to the context's tenant: `tenants/<tenantId>/...`. */
  tenantKey(ctx: Context, ...segments: Array<string | number | undefined | null>): string {
    if (!ctx.tenantId) {
      if (this.requireTenant) throw new StorageError('storage/tenant-required', 'tenantKey requires ctx.tenantId');
      return buildKey(...segments);
    }
    return buildKey('tenants', ctx.tenantId, ...segments);
  }

  async put(ctx: Context, key: string, data: Buffer | Uint8Array | string, options: PutOptions = {}): Promise<void> {
    const k = normalizeKey(key);
    return withSpan(this.tracer, 'storage.put', { key: k, access: options.access ?? 'private' }, async () => {
      await this.client.put(k, data, options);
      this.logger.info({ traceId: ctx.traceId, key: k, contentType: options.contentType }, 'File uploaded');
      this.metrics?.increment('storage.upload.count', 1);
      this.metrics?.histogram('storage.upload.bytes', byteLength(data));
    });
  }

  /** Validates size, declared MIME type and (optionally) magic bytes before uploading. */
  async putValidated(
    ctx: Context,
    key: string,
    data: Buffer | Uint8Array | string,
    options: PutOptions & { validation: UploadValidation },
  ): Promise<void> {
    const { validation, ...putOptions } = options;
    const size = byteLength(data);
    if (validation.maxSizeBytes !== undefined && size > validation.maxSizeBytes) {
      throw new StorageError('storage/file-too-large', `File size ${size} exceeds max ${validation.maxSizeBytes}`, {
        size,
        maxSizeBytes: validation.maxSizeBytes,
      });
    }
    if (validation.allowedMimeTypes) {
      if (!putOptions.contentType || !validation.allowedMimeTypes.includes(putOptions.contentType)) {
        throw new StorageError('storage/invalid-mime-type', `MIME type ${putOptions.contentType ?? '(none)'} not allowed`, {
          allowed: validation.allowedMimeTypes,
        });
      }
    }
    if (validation.sniffContent && putOptions.contentType) {
      const bytes = typeof data === 'string' ? Buffer.from(data) : data;
      if (!contentMatchesType(bytes, putOptions.contentType)) {
        throw new StorageError('storage/invalid-mime-type', 'File content does not match its declared type', {
          declared: putOptions.contentType,
        });
      }
    }
    return this.put(ctx, key, data, putOptions);
  }

  async putStream(ctx: Context, key: string, body: Readable, options: PutOptions = {}): Promise<void> {
    const k = normalizeKey(key);
    return withSpan(this.tracer, 'storage.putStream', { key: k }, async () => {
      await this.client.putStream(k, body, options);
      this.logger.info({ traceId: ctx.traceId, key: k, contentType: options.contentType }, 'File streamed');
      this.metrics?.increment('storage.upload.count', 1);
    });
  }

  async get(ctx: Context, key: string): Promise<Buffer | null> {
    const k = normalizeKey(key);
    return withSpan(this.tracer, 'storage.get', { key: k }, async () => {
      const result = await this.client.get(k);
      this.logger.debug({ traceId: ctx.traceId, key: k, found: result !== null }, 'File retrieved');
      this.metrics?.increment('storage.download.count', 1);
      return result;
    });
  }

  async getStream(ctx: Context, key: string): Promise<Readable | null> {
    const k = normalizeKey(key);
    return withSpan(this.tracer, 'storage.getStream', { key: k }, async () => this.client.getStream(k));
  }

  /** Like `get`, but throws `storage/not-found` (404) when the object is missing. */
  async getOrThrow(ctx: Context, key: string): Promise<Buffer> {
    const data = await this.get(ctx, key);
    if (!data) throw new StorageError('storage/not-found', `Object ${key} not found`, { key });
    return data;
  }

  async head(_ctx: Context, key: string): Promise<ObjectInfo | null> {
    return this.client.head(normalizeKey(key));
  }

  async exists(_ctx: Context, key: string): Promise<boolean> {
    return this.client.exists(normalizeKey(key));
  }

  async delete(ctx: Context, key: string): Promise<void> {
    const k = normalizeKey(key);
    return withSpan(this.tracer, 'storage.delete', { key: k }, async () => {
      await this.client.delete(k);
      this.logger.info({ traceId: ctx.traceId, key: k }, 'File deleted');
      this.metrics?.increment('storage.delete.count', 1);
    });
  }

  async copy(ctx: Context, from: string, to: string): Promise<void> {
    return withSpan(this.tracer, 'storage.copy', { from, to }, async () => {
      await this.client.copy(normalizeKey(from), normalizeKey(to));
      this.logger.info({ traceId: ctx.traceId, from, to }, 'File copied');
    });
  }

  async move(ctx: Context, from: string, to: string): Promise<void> {
    await this.copy(ctx, from, to);
    await this.delete(ctx, from);
  }

  async list(_ctx: Context, prefix: string, options?: ListOptions): Promise<ListResult> {
    return this.client.list(prefix, options);
  }

  async signedUrl(ctx: Context, key: string, options?: SignedUrlOptions): Promise<string> {
    const k = normalizeKey(key);
    return withSpan(this.tracer, 'storage.signedUrl', { key: k }, async () => {
      const url = await this.client.signedUrl(k, options);
      this.logger.debug({ traceId: ctx.traceId, key: k }, 'Signed URL generated');
      return url;
    });
  }

  async signedUploadUrl(ctx: Context, key: string, options?: SignedUploadOptions): Promise<string> {
    const k = normalizeKey(key);
    return withSpan(this.tracer, 'storage.signedUploadUrl', { key: k }, async () => {
      const url = await this.client.signedUploadUrl(k, options);
      this.logger.debug({ traceId: ctx.traceId, key: k }, 'Signed upload URL generated');
      return url;
    });
  }

  publicUrl(key: string): string {
    return this.client.publicUrl(normalizeKey(key));
  }

  isHealthy(): Promise<boolean> {
    return this.client.isHealthy();
  }
}

export class DefaultStorage extends Storage {}
