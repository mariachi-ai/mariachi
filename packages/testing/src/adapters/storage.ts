import type { StorageClient } from '../types';

export class TestStorageClient implements StorageClient {
  private readonly store = new Map<string, Buffer>();
  private readonly basePath: string;

  constructor(config?: { basePath?: string }) {
    this.basePath = config?.basePath ?? '';
  }

  key(...segments: string[]): string {
    return [this.basePath, ...segments].filter(Boolean).join('/');
  }

  async put(
    key: string,
    data: Buffer | Uint8Array | string,
    _options: { access: 'public' | 'private'; contentType?: string; metadata?: Record<string, string> }
  ): Promise<void> {
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : Buffer.from(data);
    this.store.set(key, buf);
  }

  async get(key: string): Promise<Buffer | null> {
    return this.store.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async signedUrl(key: string, _options?: { expiresIn?: number }): Promise<string> {
    return `https://test.example.com/signed/${key}`;
  }

  publicUrl(key: string): string {
    return `https://test.example.com/public/${key}`;
  }
}
