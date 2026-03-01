import { Webhook } from 'svix';
import { AuthError } from '@mariachi/core';
import type { ClerkWebhookEvent } from './types';

export interface SvixHeaders {
  'svix-id': string;
  'svix-timestamp': string;
  'svix-signature': string;
}

/**
 * Extract the required Svix headers from a generic headers object.
 * Returns `null` if any required header is missing.
 */
export function extractSvixHeaders(
  headers: Record<string, string | string[] | undefined>,
): SvixHeaders | null {
  const id = typeof headers['svix-id'] === 'string' ? headers['svix-id'] : undefined;
  const timestamp = typeof headers['svix-timestamp'] === 'string' ? headers['svix-timestamp'] : undefined;
  const signature = typeof headers['svix-signature'] === 'string' ? headers['svix-signature'] : undefined;

  if (!id || !timestamp || !signature) return null;

  return { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': signature };
}

/**
 * Verify a Clerk webhook payload using Svix signature verification.
 * Throws `AuthError` if the signature is invalid.
 */
export function verifyClerkWebhook(
  signingSecret: string,
  rawBody: string | Buffer,
  headers: SvixHeaders,
): ClerkWebhookEvent {
  const wh = new Webhook(signingSecret);
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');

  try {
    return wh.verify(body, headers) as ClerkWebhookEvent;
  } catch (error) {
    throw new AuthError(
      'auth/webhook-verification-failed',
      `Clerk webhook signature verification failed: ${(error as Error).message}`,
    );
  }
}
