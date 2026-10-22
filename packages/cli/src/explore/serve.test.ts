import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStaticServer, resolveRequest } from './serve';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'explorer-site-'));
fs.mkdirSync(path.join(root, 'packages', 'ai'), { recursive: true });
fs.writeFileSync(path.join(root, 'index.html'), '<h1>home</h1>');
fs.writeFileSync(path.join(root, 'packages', 'ai', 'index.html'), '<h1>ai</h1>');
fs.writeFileSync(path.join(root, '404.html'), '<h1>missing</h1>');
fs.writeFileSync(path.join(root, 'design.css'), 'a{}');
fs.writeFileSync(path.join(path.dirname(root), 'secret.txt'), 'nope');

describe('resolveRequest', () => {
  it('serves files and directory indexes', () => {
    expect(resolveRequest(root, '/')).toBe(path.join(root, 'index.html'));
    expect(resolveRequest(root, '/packages/ai/')).toBe(path.join(root, 'packages', 'ai', 'index.html'));
    expect(resolveRequest(root, '/design.css?v=1')).toBe(path.join(root, 'design.css'));
  });

  it('refuses paths outside the site', () => {
    expect(resolveRequest(root, '/../secret.txt')).toBeUndefined();
    expect(resolveRequest(root, '/%2e%2e/secret.txt')).toBeUndefined();
    expect(resolveRequest(root, '/packages/../../secret.txt')).toBeUndefined();
  });

  it('returns undefined for missing files and bad encodings', () => {
    expect(resolveRequest(root, '/nope/')).toBeUndefined();
    expect(resolveRequest(root, '/%E0%A4%A')).toBeUndefined();
  });
});

describe('createStaticServer', () => {
  const server = createStaticServer(root);
  let base = '';
  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('serves pages with content types and a 404 page', async () => {
    const page = await fetch(`${base}/packages/ai/`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toBe('<h1>ai</h1>');
    const css = await fetch(`${base}/design.css`);
    expect(css.headers.get('content-type')).toContain('text/css');
    const missing = await fetch(`${base}/missing/`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe('<h1>missing</h1>');
  });

  it('rejects non-GET methods', async () => {
    expect((await fetch(`${base}/`, { method: 'POST' })).status).toBe(405);
  });
});
