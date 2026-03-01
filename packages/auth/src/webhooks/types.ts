/**
 * Handles incoming webhooks from an auth provider.
 *
 * Implementations are responsible for signature verification and normalizing
 * provider-specific payloads into standard `AuthWebhookEvent` objects.
 */
export interface AuthWebhookHandler {
  /**
   * Verify the webhook signature and parse the event.
   *
   * The raw body must be the unparsed request body string (not a parsed JSON object)
   * since signature verification requires the exact bytes.
   *
   * @throws If signature verification fails
   */
  verify(
    rawBody: string | Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): AuthWebhookEvent;
}

export interface AuthWebhookEvent {
  /** Provider-assigned unique event ID (used for deduplication) */
  id: string;
  /** Normalized event type (e.g. 'user.created', 'session.ended') */
  type: string;
  /** Provider name that originated this event */
  provider: string;
  /** Normalized event payload */
  data: Record<string, unknown>;
  /** The original unmodified event from the provider */
  raw: unknown;
  /** Event timestamp in milliseconds (if provided by the provider) */
  timestamp?: number;
}

export type AuthEventType =
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'session.created'
  | 'session.ended'
  | 'session.revoked'
  | 'organization.created'
  | 'organization.updated'
  | 'organization.deleted'
  | 'organizationMembership.created'
  | 'organizationMembership.updated'
  | 'organizationMembership.deleted'
  | 'email.created';

export const AUTH_EVENT_TYPES: readonly AuthEventType[] = [
  'user.created',
  'user.updated',
  'user.deleted',
  'session.created',
  'session.ended',
  'session.revoked',
  'organization.created',
  'organization.updated',
  'organization.deleted',
  'organizationMembership.created',
  'organizationMembership.updated',
  'organizationMembership.deleted',
  'email.created',
] as const;
