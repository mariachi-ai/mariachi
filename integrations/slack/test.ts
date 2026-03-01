import { SendMessageInput } from './types';
import { SlackCredentials } from './credentials';

export async function dryRun(
  credentials: SlackCredentials,
  input: { channel: string; text: string; threadTs?: string }
): Promise<{ ok: true; ts: string; channel: string }> {
  SlackCredentials.parse(credentials);
  SendMessageInput.parse(input);
  return {
    ok: true,
    ts: `${Date.now()}.000000`,
    channel: input.channel,
  };
}
