import { EncryptionError } from '@mariachi/core';

export const PREFIX = 'mx1:';
export const FORMAT_VERSION = 1;
export const IV_LENGTH = 12;
export const TAG_LENGTH = 16;
export const KEY_LENGTH = 32;

export interface ParsedEnvelope {
  header: Buffer;
  keyId: string;
  wrapped: Buffer;
  iv: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
}

/**
 * Binary layout (base64url, prefixed with `mx1:`):
 *
 *   version[1] | keyIdLen[2] | keyId | wrappedLen[2] | wrapped | iv[12] | tag[16] | ciphertext
 *
 * Everything before the IV is the header and is authenticated as AAD, so the key id
 * and wrapped key cannot be swapped without failing decryption.
 */
export function encodeHeader(keyId: string, wrapped: Buffer): Buffer {
  const id = Buffer.from(keyId, 'utf8');
  if (id.length > 0xffff || wrapped.length > 0xffff) {
    throw new EncryptionError('encryption/invalid-key', 'Key id or wrapped key too long');
  }
  const header = Buffer.alloc(1 + 2 + id.length + 2 + wrapped.length);
  let o = 0;
  header.writeUInt8(FORMAT_VERSION, o);
  o += 1;
  header.writeUInt16BE(id.length, o);
  o += 2;
  id.copy(header, o);
  o += id.length;
  header.writeUInt16BE(wrapped.length, o);
  o += 2;
  wrapped.copy(header, o);
  return header;
}

export function serialize(header: Buffer, iv: Buffer, tag: Buffer, ciphertext: Buffer): string {
  return PREFIX + Buffer.concat([header, iv, tag, ciphertext]).toString('base64url');
}

function malformed(reason: string): EncryptionError {
  return new EncryptionError('encryption/invalid-ciphertext', `Invalid ciphertext: ${reason}`);
}

export function parse(value: string): ParsedEnvelope {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) throw malformed('unknown format');
  const buf = Buffer.from(value.slice(PREFIX.length), 'base64url');
  let o = 0;
  const need = (n: number) => {
    if (buf.length < o + n) throw malformed('truncated');
  };
  need(1);
  const version = buf.readUInt8(o);
  o += 1;
  if (version !== FORMAT_VERSION) throw malformed(`unsupported version ${version}`);
  need(2);
  const idLen = buf.readUInt16BE(o);
  o += 2;
  need(idLen);
  const keyId = buf.subarray(o, o + idLen).toString('utf8');
  o += idLen;
  need(2);
  const wrappedLen = buf.readUInt16BE(o);
  o += 2;
  need(wrappedLen);
  const wrapped = buf.subarray(o, o + wrappedLen);
  o += wrappedLen;
  const header = buf.subarray(0, o);
  need(IV_LENGTH + TAG_LENGTH);
  const iv = buf.subarray(o, o + IV_LENGTH);
  o += IV_LENGTH;
  const tag = buf.subarray(o, o + TAG_LENGTH);
  o += TAG_LENGTH;
  return { header, keyId, wrapped, iv, tag, ciphertext: buf.subarray(o) };
}

export function isEnvelope(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PREFIX);
}
