import type { IncomingRequest } from '@mariachi/server';
import type { AuthStrategy, ResolvedIdentity } from '../../types';

export function ApiKeyStrategy(req: IncomingRequest): ResolvedIdentity | null {
  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey !== 'string' || !apiKey) return null;
  return {
    userId: 'user-from-api-key',
    tenantId: 'tenant-default',
    scopes: ['read', 'write'],
    identityType: 'api-key' as AuthStrategy,
    apiKeyId: apiKey.slice(0, 8),
  };
}
