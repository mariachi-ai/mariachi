import { AuthError } from '@mariachi/core';
import type { AuthWebhookHandler, AuthWebhookEvent } from '@mariachi/auth';
import type { ClerkWebhookEvent } from './types';
import { extractSvixHeaders, verifyClerkWebhook } from './verify';

/**
 * Clerk implementation of `AuthWebhookHandler`.
 *
 * Verifies Svix signatures and normalizes Clerk webhook payloads into
 * standard `AuthWebhookEvent` objects. Does not handle dispatch —
 * use `createAuthWebhookDispatcher` from `@mariachi/auth` for that.
 */
export class ClerkWebhookHandler implements AuthWebhookHandler {
  constructor(private readonly signingSecret: string) {}

  verify(
    rawBody: string | Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): AuthWebhookEvent {
    const svixHeaders = extractSvixHeaders(headers);
    if (!svixHeaders) {
      throw new AuthError(
        'auth/webhook-verification-failed',
        'Missing required Svix headers (svix-id, svix-timestamp, svix-signature)',
      );
    }

    const event: ClerkWebhookEvent = verifyClerkWebhook(this.signingSecret, rawBody, svixHeaders);
    const svixTimestamp = parseInt(svixHeaders['svix-timestamp'], 10);

    return {
      id: svixHeaders['svix-id'],
      type: event.type,
      provider: 'clerk',
      data: event.data as Record<string, unknown>,
      raw: event,
      timestamp: Number.isFinite(svixTimestamp) ? svixTimestamp * 1000 : undefined,
    };
  }
}
