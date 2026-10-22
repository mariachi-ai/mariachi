import { createHmac, timingSafeEqual } from 'node:crypto';
import { AuthError } from '@mariachi/core';

/**
 * Standard Webhooks (https://www.standardwebhooks.com), the signing GoTrue's HTTP hooks use:
 * `webhook-id`, `webhook-timestamp` (Unix seconds) and `webhook-signature`, a space-separated
 * list of `v1,<base64 HMAC-SHA256 of "<id>.<timestamp>.<body>">`. The secret is `whsec_<base64>`;
 * GoTrue's configuration writes it `v1,whsec_<base64>`, several joined by `|` during a rotation.
 */

export const WEBHOOK_ID_HEADER = 'webhook-id';
export const WEBHOOK_TIMESTAMP_HEADER = 'webhook-timestamp';
export const WEBHOOK_SIGNATURE_HEADER = 'webhook-signature';

/** Decodes one or more secrets (`v1,whsec_…`, `whsec_…`, or raw base64; `|`-separated or an array) to key bytes. */
export function parseWebhookSecrets(secret: string | string[]): Buffer[] {
  const list = (Array.isArray(secret) ? secret : secret.split('|')).map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) throw new AuthError('auth/invalid-config', 'GoTrue webhook: no secret configured');
  return list.map((s) => {
    const b64 = s.replace(/^v1,/, '').replace(/^whsec_/, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
      throw new AuthError('auth/invalid-config', 'GoTrue webhook: a secret is not `v1,whsec_<base64>`');
    }
    const key = Buffer.from(b64, 'base64');
    if (key.length < 16) throw new AuthError('auth/invalid-config', 'GoTrue webhook: a secret is shorter than 16 bytes');
    return key;
  });
}

/** `v1,<base64>` for one key. */
export function signStandardWebhook(key: Buffer, id: string, timestampSeconds: number, body: string | Buffer): string {
  const mac = createHmac('sha256', key);
  mac.update(`${id}.${timestampSeconds}.`);
  mac.update(body);
  return `v1,${mac.digest('base64')}`;
}

function header(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === name) return Array.isArray(v) ? v[0] : v;
  }
  return undefined;
}

export interface VerifiedWebhook {
  id: string;
  timestampSeconds: number;
}

/**
 * Verifies the three headers against the raw body. Throws `auth/webhook-verification-failed`
 * on anything missing, stale (beyond `toleranceSeconds` either way) or unsigned by every key.
 */
export function verifyStandardWebhook(
  rawBody: string | Buffer,
  headers: Record<string, string | string[] | undefined>,
  keys: Buffer[],
  opts: { toleranceSeconds?: number; nowSeconds?: number } = {},
): VerifiedWebhook {
  const fail = (reason: string): never => {
    throw new AuthError('auth/webhook-verification-failed', `GoTrue webhook: ${reason}`);
  };
  const id = header(headers, WEBHOOK_ID_HEADER);
  const ts = header(headers, WEBHOOK_TIMESTAMP_HEADER);
  const sig = header(headers, WEBHOOK_SIGNATURE_HEADER);
  if (!id || !ts || !sig) return fail('missing webhook-id, webhook-timestamp or webhook-signature');
  if (!/^\d{1,12}$/.test(ts)) return fail('webhook-timestamp is not Unix seconds');
  const timestampSeconds = Number(ts);
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = opts.toleranceSeconds ?? 300;
  if (Math.abs(now - timestampSeconds) > tolerance) return fail('webhook-timestamp is outside the tolerance');

  const offered = sig
    .split(' ')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('v1,'))
    .map((s) => Buffer.from(s.slice(3), 'base64'));
  if (offered.length === 0) return fail('no v1 signature');
  for (const key of keys) {
    const expected = Buffer.from(signStandardWebhook(key, id, timestampSeconds, rawBody).slice(3), 'base64');
    if (offered.some((o) => o.length === expected.length && timingSafeEqual(o, expected))) {
      return { id, timestampSeconds };
    }
  }
  return fail('signature mismatch');
}
