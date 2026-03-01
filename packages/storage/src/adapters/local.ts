import { mkdir, readFile, writeFile, unlink, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  StorageConfig,
  StorageClient,
  PutOptions,
  SignedUrlOptions,
} from '../types';

export class LocalStorageAdapter implements StorageClient {
  private readonly basePath: string;

  constructor(config: StorageConfig) {
    this.basePath = config.basePath ?? './storage';
  }

  key(...segments: string[]): string {
    return segments.filter(Boolean).join('/');
  }

  private resolvePath(key: string): string {
    return join(this.basePath, key);
  }

  async put(key: string, data: Buffer | Uint8Array | string, _options: PutOptions): Promise<void> {
    const filePath = this.resolvePath(key);
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : Buffer.from(data);
    await writeFile(filePath, buf);
  }

  async get(key: string): Promise<Buffer | null> {
    const filePath = this.resolvePath(key);
    try {
      return await readFile(filePath);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolvePath(key);
    try {
      await unlink(filePath);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
        return;
      }
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.resolvePath(key);
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async signedUrl(key: string, _options?: SignedUrlOptions): Promise<string> {
    const filePath = this.resolvePath(key);
    return pathToFileURL(filePath).href;
  }

  publicUrl(key: string): string {
    const filePath = this.resolvePath(key);
    return pathToFileURL(filePath).href;
  }
}
