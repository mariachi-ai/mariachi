import { StorageError } from '@mariachi/core';

const MAX_KEY_LENGTH = 1024;
// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Normalizes and validates an object key. Keys are always relative, `/`-separated,
 * and may never contain `.`/`..` segments, backslashes, or control characters, so
 * they cannot escape the storage root on any adapter.
 */
export function normalizeKey(key: string): string {
  if (typeof key !== 'string' || key.length === 0) {
    throw new StorageError('storage/invalid-key', 'Storage key must be a non-empty string');
  }
  if (key.length > MAX_KEY_LENGTH) {
    throw new StorageError('storage/invalid-key', `Storage key exceeds ${MAX_KEY_LENGTH} characters`);
  }
  if (CONTROL_CHARS.test(key) || key.includes('\\')) {
    throw new StorageError('storage/invalid-key', 'Storage key contains forbidden characters', { key });
  }
  if (key.startsWith('/')) {
    throw new StorageError('storage/path-traversal', 'Storage key must be relative', { key });
  }
  const segments = key.split('/');
  for (const segment of segments) {
    if (segment === '..' || segment === '.') {
      throw new StorageError('storage/path-traversal', 'Storage key may not contain "." or ".." segments', { key });
    }
    if (segment === '') {
      throw new StorageError('storage/invalid-key', 'Storage key may not contain empty segments', { key });
    }
  }
  return key;
}

/** Joins segments into a key. Each segment must be a single path component. */
export function buildKey(...segments: Array<string | number | undefined | null>): string {
  const parts = segments
    .filter((s): s is string | number => s !== undefined && s !== null && s !== '')
    .map(String);
  for (const part of parts) {
    if (part.includes('/')) {
      throw new StorageError('storage/invalid-key', 'Key segments may not contain "/"', { segment: part });
    }
  }
  return normalizeKey(parts.join('/'));
}

export function normalizePrefix(prefix: string | undefined): string {
  if (!prefix) return '';
  const trimmed = prefix.replace(/\/+$/, '');
  if (!trimmed) return '';
  return `${normalizeKey(trimmed)}/`;
}
