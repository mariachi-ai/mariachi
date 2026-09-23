const SIGNATURES: Array<{ mime: string; offset?: number; bytes: number[] }> = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { mime: 'application/zip', bytes: [0x50, 0x4b, 0x03, 0x04] },
  { mime: 'application/gzip', bytes: [0x1f, 0x8b] },
  { mime: 'audio/mpeg', bytes: [0x49, 0x44, 0x33] },
  { mime: 'video/mp4', offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
];

/** Content types backed by a zip container (docx, xlsx, ...). */
const ZIP_FAMILY = /^application\/(zip|vnd\.openxmlformats-officedocument\..+|epub\+zip)$/;

/** Detects a binary content type from magic bytes, or null when unknown. */
export function sniffContentType(data: Uint8Array): string | null {
  for (const sig of SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (data.length < offset + sig.bytes.length) continue;
    if (sig.bytes.every((b, i) => data[offset + i] === b)) return sig.mime;
  }
  return null;
}

/**
 * True when the declared type is consistent with the bytes. Text-like types are
 * accepted as long as the bytes don't match a known binary signature.
 */
export function contentMatchesType(data: Uint8Array, declared: string): boolean {
  const sniffed = sniffContentType(data);
  const base = declared.split(';')[0].trim().toLowerCase();
  if (!sniffed) return !SIGNATURES.some((s) => s.mime === base);
  if (sniffed === base) return true;
  if (sniffed === 'application/zip' && ZIP_FAMILY.test(base)) return true;
  return false;
}
