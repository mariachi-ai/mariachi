import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { describe, expect, it } from 'vitest';
import type { StorageClient } from '@mariachi/storage';

/** Behavior every `StorageClient` must share: the S3, local and memory adapters and the test double. */
export function storageContract(name: string, create: () => StorageClient | Promise<StorageClient>) {
  describe(`storage contract: ${name}`, () => {
    it('stores, streams, copies, lists and deletes objects', async () => {
      const client = await create();
      const root = `c-${crypto.randomUUID().slice(0, 8)}/`;
      await client.put(`${root}a.txt`, 'hello', { contentType: 'text/plain' });
      expect((await client.get(`${root}a.txt`))?.toString()).toBe('hello');
      await client.putStream(`${root}b.txt`, Readable.from(['str', 'eamed']));
      expect((await buffer((await client.getStream(`${root}b.txt`)) as Readable)).toString()).toBe('streamed');
      await client.copy(`${root}a.txt`, `${root}c.txt`);
      expect(await client.exists(`${root}c.txt`)).toBe(true);
      const listed = await client.list(root);
      expect(listed.objects.map((object) => object.key).sort()).toEqual([`${root}a.txt`, `${root}b.txt`, `${root}c.txt`]);
      await client.delete(`${root}a.txt`);
      expect(await client.exists(`${root}a.txt`)).toBe(false);
      expect(await client.isHealthy()).toBe(true);
    });

    it('reports missing objects the same way', async () => {
      const client = await create();
      const missing = `missing-${crypto.randomUUID()}.txt`;
      expect(await client.get(missing)).toBeNull();
      expect(await client.getStream(missing)).toBeNull();
      expect(await client.exists(missing)).toBe(false);
      await expect(client.copy(missing, `${missing}.copy`)).rejects.toMatchObject({ code: 'storage/not-found' });
      await client.delete(missing); // deleting a missing object is not an error
    });

    it('rejects keys that escape the base path', async () => {
      const client = await create();
      await expect(client.put('../escape.txt', 'x')).rejects.toMatchObject({ code: expect.stringMatching(/^storage\//) });
    });
  });
}
