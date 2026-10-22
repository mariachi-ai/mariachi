import type { AuthWebhookEvent, AuthWebhookHandler } from '@mariachi/auth';
import { AuthError } from '@mariachi/core';
import { parseWebhookSecrets, verifyStandardWebhook } from './standard-webhooks';

export interface GoTrueWebhookHandlerConfig {
  /** The hook's secret as GoTrue takes it: `v1,whsec_<base64>`; several `|`-separated (or an array) during a rotation. */
  secret: string | string[];
  /** The org claim, for `tenantId` on token events. Default `org_id`. */
  orgClaim?: string;
  /** Allowed clock skew on `webhook-timestamp`, in seconds. Default 300. */
  toleranceSeconds?: number;
  /** For tests: the current time in Unix seconds. */
  nowSeconds?: () => number;
}

/** GoTrue's hook names (`metadata.name`) as of v2.197.0. */
export type GoTrueHookName =
  | 'customize-access-token'
  | 'send-email'
  | 'send-sms'
  | 'before-user-created'
  | 'after-user-created'
  | 'mfa-verification'
  | 'password-verification';

/**
 * Maps a hook (and, for the access-token hook, its `authentication_method`) onto the framework's
 * `AuthEventType` vocabulary. Hooks with no equivalent pass through under their own name.
 *
 * - `after-user-created` → `user.created`
 * - `customize-access-token` → `session.created` for a sign-in, `session.refreshed` for `token_refresh`
 * - `send-email` → `email.created`
 * - `before-user-created`, `send-sms`, `mfa-verification`, `password-verification` → unchanged
 */
export function normalizeGoTrueHook(name: string, authenticationMethod?: string): string {
  switch (name) {
    case 'after-user-created':
      return 'user.created';
    case 'customize-access-token':
      return authenticationMethod === 'token_refresh' ? 'session.refreshed' : 'session.created';
    case 'send-email':
      return 'email.created';
    default:
      return name;
  }
}

/**
 * Verifies GoTrue's HTTP hooks (Standard Webhooks, fail closed) and normalizes them to
 * `AuthWebhookEvent`. The endpoint still answers the hook itself: `{claims}` for
 * `customize-access-token`, `{}` or `{decision}` for the others (see GoTrue's hook docs).
 */
export class GoTrueWebhookHandler implements AuthWebhookHandler {
  private readonly keys: Buffer[];

  constructor(private readonly config: GoTrueWebhookHandlerConfig) {
    this.keys = parseWebhookSecrets(config.secret);
  }

  verify(rawBody: string | Buffer, headers: Record<string, string | string[] | undefined>): AuthWebhookEvent {
    const { id, timestampSeconds } = verifyStandardWebhook(rawBody, headers, this.keys, {
      toleranceSeconds: this.config.toleranceSeconds,
      nowSeconds: this.config.nowSeconds?.(),
    });
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'));
    } catch {
      throw new AuthError('auth/webhook-invalid-payload', 'GoTrue webhook body is not JSON');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new AuthError('auth/webhook-invalid-payload', 'GoTrue webhook body is not an object');
    }
    const metadata = (body.metadata ?? {}) as Record<string, unknown>;
    const name = typeof metadata.name === 'string' ? metadata.name : 'unknown';
    const method = typeof body.authentication_method === 'string' ? body.authentication_method : undefined;
    const claims = (body.claims ?? undefined) as Record<string, unknown> | undefined;
    const user = (body.user ?? undefined) as Record<string, unknown> | undefined;
    const org = claims?.[this.config.orgClaim ?? 'org_id'];
    const time = typeof metadata.time === 'string' ? Date.parse(metadata.time) : Number.NaN;

    let data: Record<string, unknown>;
    if (name === 'customize-access-token') {
      data = { userId: body.user_id, authenticationMethod: method, claims };
    } else if (name === 'send-email') {
      data = { user, email: body.email_data };
    } else if (user) {
      data = user;
    } else {
      const { metadata: _m, ...rest } = body;
      data = rest;
    }

    return {
      id,
      type: normalizeGoTrueHook(name, method),
      provider: 'gotrue',
      tenantId: typeof org === 'string' ? org : undefined,
      data,
      raw: body,
      timestamp: Number.isFinite(time) ? time : timestampSeconds * 1000,
    };
  }
}
