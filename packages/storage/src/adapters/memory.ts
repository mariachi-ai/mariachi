import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { StorageError } from '@mariachi/core';
import { normalizeKey, normalizePrefix } from '../keys';
import type {
  ListOptions,
  ListResult,
  ObjectInfo,
  PutOptions,
  SignedUploadOptions,
  SignedUrlOptions,
  StorageClient,
} from '../types';

interface StoredObject {
  data: Buffer;
  options: PutOptions;
  lastModified: Date;
}

/** In-process adapter for tests and local tooling. Applies the same key rules as real adapters. */
export class MemoryStorageAdapter implements StorageClient {
  readonly objects = new Map<string, StoredObject>();

  async put(key: string, data: Buffer | Uint8Array | string, options: PutOptions = {}): Promise<void> {
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : Buffer.from(data);
    this.objects.set(normalizeKey(key), { data: buf, options, lastModified: new Date() });
  }

  async putStream(key: string, body: Readable, options: PutOptions = {}): Promise<void> {
    await this.put(key, await buffer(body), options);
  }

  async get(key: string): Promise<Buffer | null> {
    return this.objects.get(normalizeKey(key))?.data ?? null;
  }

  async getStream(key: string): Promise<Readable | null> {
    const data = await this.get(key);
    return data ? Readable.from(data) : null;
  }

  async head(key: string): Promise<ObjectInfo | null> {
    const k = normalizeKey(key);
    const o = this.objects.get(k);
    if (!o) return null;
    return { key: k, size: o.data.byteLength, contentType: o.options.contentType, lastModified: o.lastModified, metadata: o.options.metadata };
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(normalizeKey(key));
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(normalizeKey(key));
  }

  async copy(from: string, to: string): Promise<void> {
    const o = this.objects.get(normalizeKey(from));
    if (!o) throw new StorageError('storage/not-found', `Object ${from} not found`);
    this.objects.set(normalizeKey(to), { ...o, data: Buffer.from(o.data), lastModified: new Date() });
  }

  async list(prefix: string, options: ListOptions = {}): Promise<ListResult> {
    const p = normalizePrefix(prefix);
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 1000);
    const after = options.cursor ? Buffer.from(options.cursor, 'base64url').toString('utf8') : undefined;
    const keys = [...this.objects.keys()].filter((k) => k.startsWith(p) && (!after || k > after)).sort();
    const page = keys.slice(0, limit);
    const objects = await Promise.all(page.map(async (k) => (await this.head(k)) as ObjectInfo));
    return { objects, nextCursor: keys.length > limit ? Buffer.from(page[page.length - 1]).toString('base64url') : null };
  }

  async signedUrl(key: string, options: SignedUrlOptions = {}): Promise<string> {
    return `memory://${normalizeKey(key)}?expiresIn=${options.expiresIn ?? 3600}`;
  }

  async signedUploadUrl(key: string, options: SignedUploadOptions = {}): Promise<string> {
    return `memory://${normalizeKey(key)}?upload=1&expiresIn=${options.expiresIn ?? 900}`;
  }

  publicUrl(key: string): string {
    return `memory://${normalizeKey(key)}`;
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}
