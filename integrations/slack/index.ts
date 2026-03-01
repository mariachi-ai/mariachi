import { defineIntegrationFn } from '@mariachi/integrations';
import type { IntegrationContext } from '@mariachi/integrations';
import { postMessage } from './client';
import type { SlackCredentials } from './credentials';
import { SendMessageInput, SendMessageOutput } from './types';

export interface SlackIntegrationContext extends IntegrationContext {
  credentials: SlackCredentials;
}

export const sendMessage = defineIntegrationFn<SendMessageInput, SendMessageOutput>({
  name: 'slack.sendMessage',
  input: SendMessageInput,
  output: SendMessageOutput,
  handler: async (
    input: SendMessageInput,
    ctx: IntegrationContext
  ): Promise<SendMessageOutput> => {
    const credentials = (ctx as SlackIntegrationContext).credentials;
    if (!credentials) {
      throw new Error('Slack credentials required');
    }
    return postMessage(credentials, input);
  },
  retry: { attempts: 3, backoff: 'exponential' },
});
