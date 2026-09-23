import { describe, expect, it } from 'vitest';
import { AwsKmsAdapter, createEncryption, generateLocalKey } from './index';

const k1 = generateLocalKey();
const k2 = generateLocalKey();

describe('Encryption (local)', () => {
  const enc = createEncryption({ adapter: 'local', keys: { k1 } });

  it('round-trips strings, buffers and json', async () => {
    expect(await enc.decrypt(await enc.encrypt('secret'))).toBe('secret');
    expect(await enc.decryptJson(await enc.encryptJson({ a: 1 }))).toEqual({ a: 1 });
    const buf = Buffer.from([0, 1, 2, 255]);
    expect(await enc.decryptBuffer(await enc.encryptBuffer(buf))).toEqual(buf);
  });

  it('produces distinct ciphertexts for equal plaintexts', async () => {
    expect(await enc.encrypt('x')).not.toBe(await enc.encrypt('x'));
  });

  it('binds ciphertexts to associated data', async () => {
    const ct = await enc.encrypt('ssn', { aad: 'users:1:ssn' });
    expect(await enc.decrypt(ct, { aad: 'users:1:ssn' })).toBe('ssn');
    await expect(enc.decrypt(ct, { aad: 'users:2:ssn' })).rejects.toMatchObject({ code: 'encryption/decrypt-failed' });
    await expect(enc.decrypt(ct)).rejects.toMatchObject({ code: 'encryption/decrypt-failed' });
  });

  it('detects tampering', async () => {
    const ct = await enc.encrypt('hello');
    const raw = Buffer.from(ct.slice(4), 'base64url');
    raw[raw.length - 1] ^= 1;
    await expect(enc.decrypt(`mx1:${raw.toString('base64url')}`)).rejects.toMatchObject({ code: 'encryption/decrypt-failed' });
    await expect(enc.decrypt('garbage')).rejects.toMatchObject({ code: 'encryption/invalid-ciphertext' });
  });

  it('rotates keys', async () => {
    const old = await enc.encrypt('rotate-me');
    const rotated = createEncryption({ adapter: 'local', keys: { k1, k2 }, activeKeyId: 'k2' });
    expect(rotated.needsRotation(old)).toBe(true);
    const fresh = await rotated.reEncrypt(old);
    expect(rotated.keyIdOf(fresh)).toBe('k2');
    expect(await rotated.decrypt(fresh)).toBe('rotate-me');
    const withoutOld = createEncryption({ adapter: 'local', keys: { k2 } });
    await expect(withoutOld.decrypt(old)).rejects.toMatchObject({ code: 'encryption/unknown-key' });
  });

  it('rejects weak keys', () => {
    expect(() => createEncryption({ adapter: 'local', keys: { k: 'short' } })).toThrow(/at least 32/);
  });

  it('accepts long passphrases', async () => {
    const p = createEncryption({ adapter: 'local', keys: { p: 'correct horse battery staple, but longer' } });
    expect(await p.decrypt(await p.encrypt('ok'))).toBe('ok');
  });
});

describe('AwsKmsAdapter', () => {
  it('zeroes the SDK-owned plaintext key and wraps via KMS', async () => {
    const material = Buffer.alloc(32, 7);
    let returned: Uint8Array | undefined;
    const client = {
      async send(cmd: { constructor: { name: string }; input: Record<string, unknown> }) {
        if (cmd.constructor.name === 'GenerateDataKeyCommand') {
          returned = new Uint8Array(material);
          return { Plaintext: returned, CiphertextBlob: new Uint8Array([1, 2, 3]) };
        }
        return { Plaintext: new Uint8Array(material) };
      },
    };
    const enc = createEncryption({ adapter: 'custom', instance: new AwsKmsAdapter({ keyId: 'alias/app', client }) });
    const ct = await enc.encrypt('kms');
    expect(returned?.every((b) => b === 0)).toBe(true);
    expect(enc.keyIdOf(ct)).toBe('alias/app');
    expect(await enc.decrypt(ct)).toBe('kms');
  });
});
