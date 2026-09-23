import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { httpResponse } from '@mariachi/server';
import { LocalStorageAdapter, handleSignedLocalRequest } from '@mariachi/storage';
import { BaseController, createApiServer, type HttpContext } from './index';

const silent = { info() {}, warn() {}, error() {}, debug() {}, child() { return silent; } };

/** The controller the storage guide documents: serves local signed URLs without auth. */
class SignedStorageController extends BaseController {
  readonly prefix = 'storage';
  constructor(private readonly storage: LocalStorageAdapter) {
    super();
  }
  init() {
    const serve = async (ctx: HttpContext) => {
      const res = await handleSignedLocalRequest(this.storage, { method: ctx.request.method, url: ctx.request.url, body: ctx.request.rawBody });
      return httpResponse(res.status, res.body, res.headers);
    };
    this.get('*', { auth: false }, serve);
    this.put('*', { auth: false, bodyLimitBytes: 10 * 1024 * 1024 }, serve);
  }
}

describe('local signed URLs through the facade', () => {
  it('uploads the exact bytes, serves them back, and rejects a tampered signature', async () => {
    const storage = new LocalStorageAdapter({
      basePath: await mkdtemp(join(tmpdir(), 'mariachi-local-')),
      signingSecret: 'a-long-local-signing-secret-for-tests',
      publicBaseUrl: '/api/storage',
    });
    const server = createApiServer({ name: 'test', logger: silent, prefix: '/api' }).registerController(new SignedStorageController(storage));

    const json = '{"b": 1,  "a": [2]}';      // parsed JSON would lose the spacing
    const upload = await storage.signedUploadUrl('docs/data.json', { expiresIn: 60 });
    const put = await server.inject({ method: 'PUT', url: upload, headers: { 'content-type': 'application/json' }, payload: json });
    expect(put.statusCode).toBe(204);
    expect((await storage.get('docs/data.json'))?.toString()).toBe(json);

    const read = await server.inject({ method: 'GET', url: await storage.signedUrl('docs/data.json', { expiresIn: 60 }) });
    expect(read.statusCode).toBe(200);
    expect(read.body).toBe(json);

    const forged = (await storage.signedUrl('docs/data.json')).replace(/signature=[^&]+/, 'signature=forged');
    expect((await server.inject({ method: 'GET', url: forged })).statusCode).toBe(403);
    expect((await server.inject({ method: 'GET', url: upload })).statusCode).toBe(403);   // an upload URL can't read
  });
});
