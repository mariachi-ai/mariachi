import type {
  Logger,
  Context,
  TracerAdapter,
  MetricsAdapter,
  Instrumentable,
} from '@mariachi/core';
import { withSpan, getContainer, KEYS, StorageError } from '@mariachi/core';
import type { StorageClient, PutOptions, SignedUrlOptions, UploadValidation } from './types';

export abstract class Storage implements Instrumentable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly client: StorageClient;

  constructor(config: { client: StorageClient }) {
    const container = getContainer();
    this.logger = container.resolve<Logger>(KEYS.Logger);
    this.tracer = container.has(KEYS.Tracer) ? container.resolve<TracerAdapter>(KEYS.Tracer) : undefined;
    this.metrics = container.has(KEYS.Metrics) ? container.resolve<MetricsAdapter>(KEYS.Metrics) : undefined;
    this.client = config.client;
  }

  async put(ctx: Context, key: string, data: Buffer | Uint8Array | string, options: PutOptions): Promise<void> {
    return withSpan(this.tracer, 'storage.put', { key, access: options.access }, async () => {
      this.logger.info({ traceId: ctx.traceId, key, access: options.access, contentType: options.contentType }, 'Uploading file');
      await this.client.put(key, data, options);
      this.metrics?.increment('storage.upload.count', 1);
      this.metrics?.histogram('storage.upload.bytes', typeof data === 'string' ? data.length : data.byteLength);
    });
  }

  async get(ctx: Context, key: string): Promise<Buffer | null> {
    return withSpan(this.tracer, 'storage.get', { key }, async () => {
      const result = await this.client.get(key);
      this.logger.info({ traceId: ctx.traceId, key, found: result !== null }, 'File retrieved');
      this.metrics?.increment('storage.download.count', 1);
      return result;
    });
  }

  async delete(ctx: Context, key: string): Promise<void> {
    return withSpan(this.tracer, 'storage.delete', { key }, async () => {
      await this.client.delete(key);
      this.logger.info({ traceId: ctx.traceId, key }, 'File deleted');
      this.metrics?.increment('storage.delete.count', 1);
    });
  }

  async signedUrl(ctx: Context, key: string, options?: SignedUrlOptions): Promise<string> {
    return withSpan(this.tracer, 'storage.signedUrl', { key }, async () => {
      const url = await this.client.signedUrl(key, options);
      this.logger.info({ traceId: ctx.traceId, key }, 'Signed URL generated');
      return url;
    });
  }

  async putValidated(ctx: Context, key: string, data: Buffer | Uint8Array | string, options: PutOptions & { validation?: UploadValidation }): Promise<void> {
    return withSpan(this.tracer, 'storage.putValidated', { key }, async () => {
      if (options.validation) {
        const size = typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength;
        if (options.validation.maxSizeBytes && size > options.validation.maxSizeBytes) {
          throw new StorageError('storage/file-too-large', `File size ${size} exceeds max ${options.validation.maxSizeBytes}`);
        }
        if (options.validation.allowedMimeTypes && options.contentType) {
          if (!options.validation.allowedMimeTypes.includes(options.contentType)) {
            throw new StorageError('storage/invalid-mime-type', `MIME type ${options.contentType} not allowed. Allowed: ${options.validation.allowedMimeTypes.join(', ')}`);
          }
        }
      }
      return this.put(ctx, key, data, options);
    });
  }

  key(...segments: string[]): string {
    return this.client.key(...segments);
  }
}

export class DefaultStorage extends Storage {}
