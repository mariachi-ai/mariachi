import { StorageError } from '@mariachi/core';
import type { LocalStorageAdapter } from './adapters/local';

export interface LocalStorageHttpRequest {
  method: string;
  url: string;
  body?: Buffer;
}

export interface LocalStorageHttpResponse {
  status: number;
  body?: Buffer;
  headers: Record<string, string>;
}

/**
 * Serves objects behind URLs from `LocalStorageAdapter.signedUrl` / `signedUploadUrl`.
 * Mount this from the API facade on the adapter's `publicBaseUrl`.
 */
export async function handleSignedLocalRequest(
  adapter: LocalStorageAdapter,
  request: LocalStorageHttpRequest,
): Promise<LocalStorageHttpResponse> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') {
    return { status: 405, headers: { allow: 'GET, PUT' } };
  }
  const key = adapter.verifySignedUrl(request.url, method);
  if (!key) throw new StorageError('storage/invalid-signature', 'Signed URL is invalid or expired');
  if (method === 'PUT') {
    if (!request.body) throw new StorageError('storage/invalid-input', 'Signed upload requires a body');
    await adapter.put(key, request.body);
    return { status: 204, headers: {} };
  }
  const data = await adapter.get(key);
  if (!data) throw new StorageError('storage/not-found', `Object ${key} not found`, { key });
  const info = await adapter.head(key);
  return {
    status: 200,
    body: data,
    headers: info?.contentType ? { 'content-type': info.contentType } : {},
  };
}
