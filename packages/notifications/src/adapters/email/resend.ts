import { Resend } from 'resend';
import { NotificationError } from '@mariachi/core';
import type { EmailAdapter, EmailMessage } from '../../types';

export interface ResendEmailAdapterOptions {
  apiKey: string;
  from?: string;
}

export class ResendEmailAdapter implements EmailAdapter {
  private readonly resend: Resend;
  private readonly defaultFrom?: string;

  constructor(options: ResendEmailAdapterOptions) {
    this.resend = new Resend(options.apiKey);
    this.defaultFrom = options.from;
  }

  async send(message: EmailMessage): Promise<{ id: string }> {
    const from = message.from ?? this.defaultFrom;
    if (!from) {
      throw new NotificationError('notifications/invalid-input', 'Email "from" is required');
    }
    const to = Array.isArray(message.to) ? message.to : [message.to];
    const payload = {
      from,
      to,
      subject: message.subject,
      ...(message.replyTo && { replyTo: message.replyTo }),
    };
    const withContent =
      message.html && message.text
        ? { ...payload, html: message.html, text: message.text }
        : message.html
          ? { ...payload, html: message.html }
          : { ...payload, text: message.text ?? '' };
    const { data, error } = await this.resend.emails.send(withContent);
    if (error) {
      throw new NotificationError('notifications/provider-failed', `Resend: ${error.message}`, { provider: 'resend', name: error.name });
    }
    if (!data?.id) {
      throw new NotificationError('notifications/provider-failed', 'Resend did not return an id', { provider: 'resend' });
    }
    return { id: data.id };
  }
}
