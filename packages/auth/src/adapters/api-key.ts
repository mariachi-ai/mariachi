import { createHash, randomBytes } from 'node:crypto';
import { AuthError } from '@mariachi/core';
import type { AuthenticationAdapter, ResolvedIdentity } from '../types';

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export interface GeneratedApiKey {
  /** Show to the user once; never store. */
  key: string;
  /** Non-secret identifier safe to display and log (e.g. `ak_live_3f9a`). */
  prefix: string;
  /** Store this. */
  hashedKey: string;
}

/** Generates `ak_<env>_<id>_<secret>` keys. Only the hash should be persisted. */
export function createApiKey(env = 'live'): GeneratedApiKey {
  const id = randomBytes(4).toString('hex');
  const secret = randomBytes(32).toString('base64url');
  const key = `ak_${env}_${id}_${secret}`;
  return { key, prefix: `ak_${env}_${id}`, hashedKey: hashApiKey(key) };
}

/** @deprecated use createApiKey(), which also returns the prefix and hash */
export function generateApiKey(): string {
  return createApiKey().key;
}

export class ApiKeyAdapter implements AuthenticationAdapter {
  constructor(private readonly lookup: (hashedKey: string) => Promise<ResolvedIdentity | null>) {}

  async verify(token: string): Promise<ResolvedIdentity> {
    if (!token || token.length > 512) throw new AuthError('auth/invalid-api-key', 'Invalid API key');
    const identity = await this.lookup(hashApiKey(token));
    if (!identity) throw new AuthError('auth/invalid-api-key', 'Invalid API key');
    return { ...identity, identityType: 'api-key' };
  }

  async sign(): Promise<string> {
    throw new AuthError('auth/not-supported', 'API keys are generated with createApiKey(), not signed');
  }
}
