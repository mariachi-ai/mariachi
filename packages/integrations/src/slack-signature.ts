import { createHmac, timingSafeEqual } from 'node:crypto';
import { IntegrationError } from '@mariachi/core';

const MAX_SKEW_SECONDS = 60 * 5;

/**
 * Verifies a Slack request signature (`X-Slack-Signature` over `v0:timestamp:body`).
 * Rejects timestamps more than five minutes off to stop replays.
 */
export function verifySlackSignature(
  signingSecret: string,
  headers: Record<string, string | undefined>,
  rawBody: string | Buffer,
  now = Date.now(),
): boolean {
  const timestamp = headers['x-slack-request-timestamp'] ?? headers['X-Slack-Request-Timestamp'];
  const signature = headers['x-slack-signature'] ?? headers['X-Slack-Signature'];
  if (!timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > MAX_SKEW_SECONDS) return false;
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const expected = `v0=${createHmac('sha256', signingSecret).update(`v0:${timestamp}:${body}`).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function assertSlackSignature(
  signingSecret: string,
  headers: Record<string, string | undefined>,
  rawBody: string | Buffer,
  now = Date.now(),
): void {
  if (!verifySlackSignature(signingSecret, headers, rawBody, now)) {
    throw new IntegrationError('integrations/invalid-signature', 'Slack request signature is invalid');
  }
}
