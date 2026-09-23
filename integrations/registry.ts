import { IntegrationRegistry } from '@mariachi/integrations';
import { sendMessage } from './slack/index';
import { SlackCredentials } from './slack/credentials';

const registry = new IntegrationRegistry();

registry.register({
  name: 'slack',
  description: 'Slack workspace integration for messaging',
  credentialSchema: SlackCredentials,
  functions: ['slack.sendMessage'],
  handlers: { sendMessage },
});

export { registry };
