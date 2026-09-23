import { NotificationError } from '@mariachi/core';
import type { PushAdapter } from '../../types';

export interface FcmPushConfig {
  projectId: string;
  /** OAuth access token, or a function that returns a fresh one. */
  accessToken: string | (() => Promise<string>);
  fetch?: typeof fetch;
}

/** Firebase Cloud Messaging HTTP v1. */
export class FcmPushAdapter implements PushAdapter {
  constructor(private readonly config: FcmPushConfig) {}

  async send(token: string, title: string, body: string, data?: Record<string, string>): Promise<{ id: string }> {
    const accessToken = typeof this.config.accessToken === 'function' ? await this.config.accessToken() : this.config.accessToken;
    const res = await (this.config.fetch ?? fetch)(
      `https://fcm.googleapis.com/v1/projects/${this.config.projectId}/messages:send`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token, notification: { title, body }, data } }),
      },
    );
    const payload = (await res.json()) as { name?: string; error?: { message?: string } };
    if (!res.ok || !payload.name) {
      throw new NotificationError('notifications/push-send-failed', payload.error?.message ?? `FCM responded ${res.status}`);
    }
    return { id: payload.name };
  }
}
