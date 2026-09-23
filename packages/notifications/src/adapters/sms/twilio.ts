import { NotificationError } from '@mariachi/core';
import type { SMSAdapter } from '../../types';

export interface TwilioSmsConfig {
  accountSid: string;
  authToken: string;
  from: string;
  fetch?: typeof fetch;
}

/** Twilio Programmable SMS. Credentials come from config, never from the environment directly. */
export class TwilioSmsAdapter implements SMSAdapter {
  constructor(private readonly config: TwilioSmsConfig) {}

  async send(to: string, body: string): Promise<{ id: string }> {
    const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64');
    const form = new URLSearchParams({ To: to, From: this.config.from, Body: body });
    const res = await (this.config.fetch ?? fetch)(
      `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      },
    );
    const data = (await res.json()) as { sid?: string; message?: string };
    if (!res.ok || !data.sid) {
      throw new NotificationError('notifications/sms-send-failed', data.message ?? `Twilio responded ${res.status}`);
    }
    return { id: data.sid };
  }
}
