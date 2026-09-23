import { MemoryStorageAdapter, normalizeKey } from '@mariachi/storage';

/**
 * Storage double. Shares the memory adapter's behavior (key validation, missing-object
 * semantics), so the storage contract suite holds for both; URLs point at test.example.com.
 */
export class TestStorageClient extends MemoryStorageAdapter {
  override async signedUrl(key: string, options?: { expiresIn?: number }): Promise<string> {
    return `https://test.example.com/signed/${normalizeKey(key)}?expiresIn=${options?.expiresIn ?? 3600}`;
  }

  override async signedUploadUrl(key: string, options?: { expiresIn?: number }): Promise<string> {
    return `https://test.example.com/upload/${normalizeKey(key)}?expiresIn=${options?.expiresIn ?? 900}`;
  }

  override publicUrl(key: string): string {
    return `https://test.example.com/${normalizeKey(key)}`;
  }
}
