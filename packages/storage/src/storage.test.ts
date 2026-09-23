import { Readable } from 'node:stream';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createContext } from '@mariachi/core';
import { DefaultStorage, LocalStorageAdapter, MemoryStorageAdapter, handleSignedLocalRequest, normalizeKey, sniffContentType } from './index';

const silent = { info() {}, warn() {}, error() {}, debug() {}, child() { return silent; } };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

describe('normalizeKey', () => {
  it.each(['../etc/passwd', 'a/../../b', '/abs', 'a\\b', 'a//b', './a', 'a\u0000b', ''])('rejects %j', (key) => {
    expect(() => normalizeKey(key)).toThrow();
  });

  it('accepts ordinary keys', () => {
    expect(normalizeKey('avatars/u1/original.png')).toBe('avatars/u1/original.png');
  });
});

describe('LocalStorageAdapter', () => {
  let root: string;
  let adapter: LocalStorageAdapter;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mariachi-storage-'));
    adapter = new LocalStorageAdapter({ basePath: join(root, 'data'), signingSecret: 's'.repeat(32) });
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  it('cannot write outside the root', async () => {
    await expect(adapter.put('../escape.txt', 'x')).rejects.toMatchObject({ code: 'storage/path-traversal' });
    expect(await readdir(root)).toEqual([]);
  });

  it('stores content type and lists with cursors', async () => {
    for (const n of ['a', 'b', 'c']) await adapter.put(`docs/${n}.txt`, n, { contentType: 'text/plain' });
    expect((await adapter.head('docs/a.txt'))?.contentType).toBe('text/plain');
    const first = await adapter.list('docs', { limit: 2 });
    expect(first.objects.map((o) => o.key)).toEqual(['docs/a.txt', 'docs/b.txt']);
    const second = await adapter.list('docs', { limit: 2, cursor: first.nextCursor! });
    expect(second.objects.map((o) => o.key)).toEqual(['docs/c.txt']);
    expect(second.nextCursor).toBeNull();
  });

  it('signs and verifies URLs', async () => {
    const url = await adapter.signedUrl('docs/a.txt');
    expect(adapter.verifySignedUrl(url)).toBe('docs/a.txt');
    expect(adapter.verifySignedUrl(url.replace('a.txt', 'b.txt'))).toBeNull();
    expect(adapter.verifySignedUrl(url, 'PUT')).toBeNull();
  });

  it('streams a put and serves the signed URL', async () => {
    await adapter.putStream('docs/stream.txt', Readable.from(['hello']), { contentType: 'text/plain' });
    expect((await adapter.get('docs/stream.txt'))?.toString()).toBe('hello');
    const url = await adapter.signedUrl('docs/stream.txt');
    const response = await handleSignedLocalRequest(adapter, { method: 'GET', url });
    expect(response.status).toBe(200);
    expect(response.body?.toString()).toBe('hello');
  });
});

describe('Storage', () => {
  const storage = new DefaultStorage({ client: new MemoryStorageAdapter() }, { logger: silent });
  const ctx = createContext({ logger: silent, tenantId: 't1' });

  it('namespaces tenant keys and requires a tenant', () => {
    expect(storage.tenantKey(ctx, 'avatars', 'u1.png')).toBe('tenants/t1/avatars/u1.png');
    expect(() => storage.tenantKey(createContext({ logger: silent }), 'x')).toThrow(/tenant/);
    expect(() => storage.key('a/b')).toThrow();
  });

  it('rejects content that lies about its type', async () => {
    const validation = { allowedMimeTypes: ['image/png', 'application/pdf'], sniffContent: true };
    await storage.putValidated(ctx, 'ok.png', PNG, { contentType: 'image/png', validation });
    await expect(storage.putValidated(ctx, 'bad.pdf', PNG, { contentType: 'application/pdf', validation })).rejects.toMatchObject({
      code: 'storage/invalid-mime-type',
    });
    expect(sniffContentType(PNG)).toBe('image/png');
  });

  it('getOrThrow raises storage/not-found', async () => {
    await expect(storage.getOrThrow(ctx, 'missing')).rejects.toMatchObject({ code: 'storage/not-found' });
  });
});
