import { FastifyAdapter } from '@mariachi/api-facade';

export function createAdminServer() {
  return new FastifyAdapter({ name: 'admin' })
    .withAuth(['session'])
    .withRateLimit({ perUser: 100, window: '1h' });
}
