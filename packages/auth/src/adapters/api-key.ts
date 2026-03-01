import { createHash, randomBytes } from 'crypto';
import type { AuthenticationAdapter, ResolvedIdentity } from '../types';

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): string {
  return `ak_${randomBytes(32).toString('hex')}`;
}

export class ApiKeyAdapter implements AuthenticationAdapter {
  constructor(
    private readonly lookup: (hashedKey: string) => Promise<ResolvedIdentity | null>,
  ) {}

  async verify(token: string): Promise<ResolvedIdentity> {
    const hashed = hashApiKey(token);
    const identity = await this.lookup(hashed);
    if (!identity) {
      throw new Error('Invalid API key');
    }
    return {
      ...identity,
      identityType: 'api-key',
    };
  }

  async sign(): Promise<string> {
    throw new Error('API keys are not signed; they are generated externally');
  }
}
