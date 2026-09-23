import { connect } from 'node:net';
import { NotificationError } from '@mariachi/core';
import type { EmailAdapter, EmailMessage } from '../../types';

export interface SmtpEmailConfig {
  host: string;
  port: number;
  from: string;
}

/**
 * Minimal SMTP client for local Mailpit (no auth, no TLS). It speaks just enough
 * of the protocol to hand a message to a development sink.
 */
export class SmtpEmailAdapter implements EmailAdapter {
  constructor(private readonly config: SmtpEmailConfig) {}

  async send(message: EmailMessage): Promise<{ id: string }> {
    const from = message.from ?? this.config.from;
    const recipients = (Array.isArray(message.to) ? message.to : [message.to]).filter(Boolean);
    if (recipients.length === 0) throw new NotificationError('notifications/missing-recipient', 'SMTP message has no recipient');
    const id = crypto.randomUUID();
    const body = [
      `From: ${from}`,
      `To: ${recipients.join(', ')}`,
      `Subject: ${message.subject}`,
      'MIME-Version: 1.0',
      `Content-Type: ${message.html ? 'text/html' : 'text/plain'}; charset=utf-8`,
      '',
      message.html ?? message.text ?? '',
    ].join('\r\n');
    await this.deliver(from, recipients, body);
    return { id };
  }

  private deliver(from: string, recipients: string[], body: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: this.config.host, port: this.config.port });
      const fail = (error: Error) => {
        socket.destroy();
        reject(error instanceof NotificationError ? error : new NotificationError('notifications/email-send-failed', error.message));
      };
      let buffer = '';
      const queue = [
        'EHLO mariachi',
        `MAIL FROM:<${from}>`,
        ...recipients.map((r) => `RCPT TO:<${r}>`),
        'DATA',
        `${body}\r\n.`,
        'QUIT',
      ];
      const next = () => {
        const command = queue.shift();
        if (command) socket.write(`${command}\r\n`);
      };
      socket.on('error', fail);
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        if (!buffer.includes('\n')) return;
        const line = buffer.trim();
        buffer = '';
        const code = Number(line.slice(0, 3));
        if (code >= 400) return fail(new NotificationError('notifications/email-send-failed', `SMTP ${line}`));
        if (queue.length === 0) {
          socket.end();
          resolve();
          return;
        }
        next();
      });
    });
  }
}
