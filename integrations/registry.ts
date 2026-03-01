import { IntegrationRegistry } from '@mariachi/integrations';
import { SlackCredentials } from './slack/credentials';

const registry = new IntegrationRegistry();

registry.register({
  name: 'slack',
  description: 'Slack workspace integration for messaging',
  credentialSchema: SlackCredentials,
  functions: ['slack.sendMessage'],
});

export { registry };
