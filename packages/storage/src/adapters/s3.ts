import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  StorageConfig,
  StorageClient,
  PutOptions,
  SignedUrlOptions,
} from '../types';

export class S3StorageAdapter implements StorageClient {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly basePath: string;

  constructor(config: StorageConfig) {
    if (!config.bucket || !config.region) {
      throw new Error('S3 adapter requires bucket and region');
    }
    this.client = new S3Client({ region: config.region });
    this.bucket = config.bucket;
    this.region = config.region;
    this.basePath = config.basePath ?? '';
  }

  key(...segments: string[]): string {
    return segments.filter(Boolean).join('/');
  }

  private fullKey(key: string): string {
    return this.basePath ? `${this.basePath}/${key}` : key;
  }

  async put(key: string, data: Buffer | Uint8Array | string, options: PutOptions): Promise<void> {
    const fullKey = this.fullKey(key);
    const body = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    const acl = options.access === 'public' ? 'public-read' : 'private';

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: fullKey,
        Body: body,
        ACL: acl,
        ContentType: options.contentType,
        Metadata: options.metadata,
      }),
    );
  }

  async get(key: string): Promise<Buffer | null> {
    const fullKey = this.fullKey(key);
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: fullKey }),
      );
      if (!response.Body) return null;
      const bytes = await response.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'name' in err && err.name === 'NoSuchKey') {
        return null;
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const fullKey = this.fullKey(key);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: fullKey }),
    );
  }

  async exists(key: string): Promise<boolean> {
    const fullKey = this.fullKey(key);
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: fullKey }),
      );
      return true;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'name' in err && err.name === 'NotFound') {
        return false;
      }
      throw err;
    }
  }

  async signedUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    const fullKey = this.fullKey(key);
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: fullKey });
    return getSignedUrl(this.client, command, {
      expiresIn: options?.expiresIn ?? 3600,
    });
  }

  publicUrl(key: string): string {
    const fullKey = this.fullKey(key);
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${fullKey}`;
  }
}
