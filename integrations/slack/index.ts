import { IntegrationError } from '@mariachi/core';
import { defineIntegrationFn, resolveTenantCredential } from '@mariachi/integrations';
import type { IntegrationContext } from '@mariachi/integrations';
import { postMessage } from './client';
import type { SlackCredentials } from './credentials';
import { SendMessageInput, SendMessageOutput } from './types';

export interface SlackIntegrationContext extends IntegrationContext {
  credentials: Pick<SlackCredentials, 'botToken'>;
}

export { verifySlackSignature, assertSlackSignature } from './verify';

export const sendMessage = defineIntegrationFn<SendMessageInput, SendMessageOutput>({
  name: 'slack.sendMessage',
  input: SendMessageInput,
  output: SendMessageOutput,
  handler: async (
    input: SendMessageInput,
    ctx: IntegrationContext
  ): Promise<SendMessageOutput> => {
    let credentials = (ctx as SlackIntegrationContext).credentials;
    if (!credentials && ctx.secrets) {
      const botToken = await resolveTenantCredential(ctx, ctx.credentialKey ?? 'slack.botToken', ctx.secrets, ctx.decrypt);
      credentials = { botToken };
    }
    if (!credentials) {
      throw new IntegrationError('integrations/missing-credential', 'Slack credentials required');
    }
    return postMessage(credentials, input);
  },
  retry: { attempts: 3, backoff: 'exponential' },
});
