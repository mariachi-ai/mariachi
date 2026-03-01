import type { EmailAdapter, EmailMessage } from '../types';

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
