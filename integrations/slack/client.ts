import type { SlackCredentials } from './credentials';
import type { SendMessageInput, SendMessageOutput } from './types';

export async function postMessage(
  credentials: SlackCredentials,
  input: SendMessageInput
): Promise<SendMessageOutput> {
  const url = 'https://slack.com/api/chat.postMessage';
  const body = {
    channel: input.channel,
    text: input.text,
    ...(input.threadTs && { thread_ts: input.threadTs }),
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${credentials.botToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as { ok: boolean; ts?: string; channel?: string };
  if (!data.ok) {
    throw new Error(`Slack API error: ${JSON.stringify(data)}`);
  }

  return {
    ts: data.ts ?? '',
    channel: data.channel ?? input.channel,
    ok: data.ok,
  };
}
