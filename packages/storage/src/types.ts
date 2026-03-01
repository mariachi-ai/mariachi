export interface StorageConfig {
  adapter: string;
  bucket?: string;
  region?: string;
  basePath?: string;
}

export type AccessControl = 'public' | 'private';

export interface PutOptions {
  access: AccessControl;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface SignedUrlOptions {
  expiresIn?: number;
}

export interface UploadValidation {
  maxSizeBytes?: number;
  allowedMimeTypes?: string[];
}

export interface StorageClient {
  key(...segments: string[]): string;
  put(key: string, data: Buffer | Uint8Array | string, options: PutOptions): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  signedUrl(key: string, options?: SignedUrlOptions): Promise<string>;
  publicUrl(key: string): string;
}
