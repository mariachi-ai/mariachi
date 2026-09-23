import { IntegrationError, type Context } from '@mariachi/core';
import type { IntegrationContext } from './types';

export interface SecretReader {
  get(key: string, tenantId?: string): Promise<string | undefined>;
}

export interface FieldDecryptor {
  decrypt(ciphertext: string): Promise<string>;
}

/**
 * Loads a tenant secret, falling back to the global value, and decrypts it when a
 * decryptor is provided. Ciphertext is what `@mariachi/encryption` stores.
 * Pass `fallbackToGlobal: false` for credentials that must belong to the tenant (its own Slack
 * workspace, its own API account): a missing tenant secret then fails instead of using yours.
 */
export async function resolveTenantCredential(
  ctx: Pick<Context, 'tenantId'> | IntegrationContext,
  key: string,
  secrets: SecretReader,
  decryptor?: FieldDecryptor,
  options: { fallbackToGlobal?: boolean } = {},
): Promise<string> {
  const tenantId = ctx.tenantId ?? undefined;
  const fallback = options.fallbackToGlobal ?? true;
  if (!tenantId && !fallback) {
    throw new IntegrationError('integrations/missing-credential', `Credential "${key}" requires a tenant`, { key });
  }
  const scoped = tenantId ? await secrets.get(key, tenantId) : undefined;
  const raw = scoped ?? (fallback ? await secrets.get(key) : undefined);
  if (!raw) {
    throw new IntegrationError('integrations/missing-credential', `Missing credential "${key}"`, { key, tenantId });
  }
  return decryptor ? decryptor.decrypt(raw) : raw;
}
