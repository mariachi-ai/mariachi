import { FastifyAdapter } from '@mariachi/api-facade';

export function createPublicServer() {
  return new FastifyAdapter({ name: 'public' })
    .withAuth(['session', 'api-key'])
    .withRateLimit({ perUser: 1000, perApiKey: 5000, window: '1h' });
}
