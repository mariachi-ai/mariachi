import { createReadStream, createWriteStream, type Dirent } from 'node:fs';
import { access, copyFile, mkdir, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { dirname, join, relative, resolve, sep } from 'node:path';
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
  StorageConfig,
} from '../types';

const META_DIR = '.mariachi-meta';
const MAX_EXPIRES = 7 * 24 * 3600;

interface Sidecar {
  contentType?: string;
  metadata?: Record<string, string>;
  access?: string;
}

function isEnoent(err: unknown): boolean {
  return !!err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ENOENT';
}

/**
 * Filesystem adapter for development and single-node deployments. Every key is
 * normalized and the resolved path is verified to stay inside `basePath`.
 */
export class LocalStorageAdapter implements StorageClient {
  private readonly root: string;
  private readonly signingSecret?: string;
  private readonly publicBaseUrl: string;

  constructor(config: Pick<StorageConfig, 'basePath' | 'signingSecret' | 'publicBaseUrl'> = {}) {
    this.root = resolve(config.basePath ?? './storage');
    this.signingSecret = config.signingSecret;
    this.publicBaseUrl = (config.publicBaseUrl ?? '/storage').replace(/\/+$/, '');
  }

  private resolvePath(key: string): string {
    const normalized = normalizeKey(key);
    if (normalized === META_DIR || normalized.startsWith(`${META_DIR}/`)) {
      throw new StorageError('storage/invalid-key', `Keys may not start with ${META_DIR}`);
    }
    const full = resolve(this.root, normalized);
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new StorageError('storage/path-traversal', 'Resolved path escapes the storage root', { key });
    }
    return full;
  }

  private metaPath(key: string): string {
    return join(this.root, META_DIR, `${normalizeKey(key)}.json`);
  }

  private async readSidecar(key: string): Promise<Sidecar> {
    try {
      return JSON.parse(await readFile(this.metaPath(key), 'utf8')) as Sidecar;
    } catch {
      return {};
    }
  }

  async put(key: string, data: Buffer | Uint8Array | string, options: PutOptions = {}): Promise<void> {
    const filePath = this.resolvePath(key);
    await mkdir(dirname(filePath), { recursive: true });
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : Buffer.from(data);
    await writeFile(filePath, buf);
    const sidecar: Sidecar = { contentType: options.contentType, metadata: options.metadata, access: options.access };
    const metaPath = this.metaPath(key);
    await mkdir(dirname(metaPath), { recursive: true });
    await writeFile(metaPath, JSON.stringify(sidecar));
  }

  async putStream(key: string, body: Readable, options: PutOptions = {}): Promise<void> {
    const filePath = this.resolvePath(key);
    await mkdir(dirname(filePath), { recursive: true });
    await pipeline(body, createWriteStream(filePath));
    const sidecar: Sidecar = { contentType: options.contentType, metadata: options.metadata, access: options.access ?? options.acl };
    const metaPath = this.metaPath(key);
    await mkdir(dirname(metaPath), { recursive: true });
    await writeFile(metaPath, JSON.stringify(sidecar));
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolvePath(key));
    } catch (err) {
      if (isEnoent(err)) return null;
      throw new StorageError('storage/read-failed', `Failed to read ${key}`, { cause: String(err) });
    }
  }

  async getStream(key: string): Promise<Readable | null> {
    if (!(await this.exists(key))) return null;
    return createReadStream(this.resolvePath(key));
  }

  async head(key: string): Promise<ObjectInfo | null> {
    try {
      const info = await stat(this.resolvePath(key));
      if (!info.isFile()) return null;
      const sidecar = await this.readSidecar(key);
      return { key, size: info.size, lastModified: info.mtime, contentType: sidecar.contentType, metadata: sidecar.metadata };
    } catch (err) {
      if (isEnoent(err)) return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolvePath(key));
    } catch (err) {
      if (!isEnoent(err)) throw new StorageError('storage/delete-failed', `Failed to delete ${key}`, { cause: String(err) });
    }
    await rm(this.metaPath(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.resolvePath(key));
      return true;
    } catch {
      return false;
    }
  }

  async copy(from: string, to: string): Promise<void> {
    const src = this.resolvePath(from);
    const dest = this.resolvePath(to);
    await mkdir(dirname(dest), { recursive: true });
    try {
      await copyFile(src, dest);
    } catch (err) {
      if (isEnoent(err)) throw new StorageError('storage/not-found', `Object ${from} not found`);
      throw err;
    }
    const sidecar = await this.readSidecar(from);
    const metaPath = this.metaPath(to);
    await mkdir(dirname(metaPath), { recursive: true });
    await writeFile(metaPath, JSON.stringify(sidecar));
  }

  async list(prefix: string, options: ListOptions = {}): Promise<ListResult> {
    const normalizedPrefix = normalizePrefix(prefix);
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 1000);
    const after = options.cursor ? Buffer.from(options.cursor, 'base64url').toString('utf8') : undefined;

    const startDir = normalizedPrefix ? this.resolvePath(normalizedPrefix.slice(0, -1)) : this.root;
    const keys: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries: Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (err) {
        if (isEnoent(err)) return;
        throw err;
      }
      for (const entry of entries) {
        const full = join(dir, entry.name);
        const rel = relative(this.root, full).split(sep).join('/');
        if (rel === META_DIR || rel.startsWith(`${META_DIR}/`)) continue;
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile()) keys.push(rel);
      }
    };
    await walk(startDir);
    keys.sort();

    const candidates = after ? keys.filter((k) => k > after) : keys;
    const page = candidates.slice(0, limit);
    const objects = await Promise.all(page.map(async (k) => (await this.head(k)) as ObjectInfo));
    const nextCursor = candidates.length > limit ? Buffer.from(page[page.length - 1]).toString('base64url') : null;
    return { objects: objects.filter(Boolean), nextCursor };
  }

  private sign(method: string, key: string, expires: number): string {
    if (!this.signingSecret) {
      throw new StorageError('storage/not-supported', 'Local signed URLs require `signingSecret`');
    }
    return createHmac('sha256', this.signingSecret).update(`${method}\n${key}\n${expires}`).digest('base64url');
  }

  private buildSignedUrl(method: string, key: string, expiresIn = 3600): string {
    const normalized = normalizeKey(key);
    const expires = Math.floor(Date.now() / 1000) + Math.min(expiresIn, MAX_EXPIRES);
    const signature = this.sign(method, normalized, expires);
    const path = normalized.split('/').map(encodeURIComponent).join('/');
    return `${this.publicBaseUrl}/${path}?expires=${expires}&method=${method}&signature=${signature}`;
  }

  async signedUrl(key: string, options: SignedUrlOptions = {}): Promise<string> {
    return this.buildSignedUrl('GET', key, options.expiresIn);
  }

  async signedUploadUrl(key: string, options: SignedUploadOptions = {}): Promise<string> {
    return this.buildSignedUrl('PUT', key, options.expiresIn);
  }

  /**
   * Verifies a URL produced by `signedUrl`/`signedUploadUrl`. Returns the key when
   * the signature is valid and unexpired, otherwise null. Use this in the route
   * that serves local files.
   */
  verifySignedUrl(url: string, method: 'GET' | 'PUT' = 'GET'): string | null {
    const parsed = new URL(url, 'http://local');
    const expires = Number(parsed.searchParams.get('expires'));
    const signature = parsed.searchParams.get('signature') ?? '';
    if (parsed.searchParams.get('method') !== method) return null;
    if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return null;
    const base = new URL(this.publicBaseUrl, 'http://local').pathname.replace(/\/+$/, '');
    if (!parsed.pathname.startsWith(`${base}/`)) return null;
    let key: string;
    try {
      key = normalizeKey(parsed.pathname.slice(base.length + 1).split('/').map(decodeURIComponent).join('/'));
    } catch {
      return null;
    }
    const expected = Buffer.from(this.sign(method, key, expires));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual) ? key : null;
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${normalizeKey(key).split('/').map(encodeURIComponent).join('/')}`;
  }

  async isHealthy(): Promise<boolean> {
    try {
      await mkdir(this.root, { recursive: true });
      await access(this.root);
      return true;
    } catch {
      return false;
    }
  }
}
