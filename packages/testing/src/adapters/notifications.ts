import { MemoryInAppStore } from '@mariachi/notifications';
import type { EmailAdapter, EmailMessage, PushAdapter, SMSAdapter } from '@mariachi/notifications';

export class TestEmailAdapter implements EmailAdapter {
  private readonly sentMessages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<{ id: string }> {
    this.sentMessages.push(message);
    return { id: `test-${this.sentMessages.length}` };
  }

  getSentEmails(): EmailMessage[] {
    return [...this.sentMessages];
  }
}

export class TestSMSAdapter implements SMSAdapter {
  readonly sent: Array<{ to: string; body: string }> = [];
  async send(to: string, body: string): Promise<{ id: string }> {
    this.sent.push({ to, body });
    return { id: `sms-${this.sent.length}` };
  }
}

export class TestPushAdapter implements PushAdapter {
  readonly sent: Array<{ token: string; title: string; body: string }> = [];
  async send(token: string, title: string, body: string): Promise<{ id: string }> {
    this.sent.push({ token, title, body });
    return { id: `push-${this.sent.length}` };
  }
}

/** In-app double. The memory inbox, so the in-app contract suite holds for both. */
export class TestInAppStore extends MemoryInAppStore {}
