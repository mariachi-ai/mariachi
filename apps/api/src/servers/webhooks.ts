import { FastifyAdapter } from '@mariachi/api-facade';

export function createWebhookServer() {
  return new FastifyAdapter({ name: 'webhooks' }).withAuth(['webhook']);
}
