import { eq } from 'drizzle-orm';
import { compileTable, type DrizzleDb } from '@mariachi/database-postgres';
import { apiKeysTable } from '../schema/api-keys';
import type { ApiKeyRecord, ApiKeyStore } from '../api-keys';

const apiKeys = compileTable(apiKeysTable);

type Row = typeof apiKeys.$inferSelect;

function toRecord(r: Row): ApiKeyRecord {
  return {
    id: r.id,
    tenantId: r.tenantId,
    userId: r.userId ?? '',
    name: r.name,
    hashedKey: r.hashedKey,
    prefix: r.prefix,
    scopes: Array.isArray(r.scopes) ? (r.scopes as string[]) : [],
    active: r.active,
    expiresAt: r.expiresAt ?? null,
    rotatedFromId: r.rotatedFromId ?? null,
    revokedAt: r.revokedAt ?? null,
  };
}

/** `api_keys` table store for `ApiKeyService`. Only key hashes are stored. */
export class DrizzleApiKeyStore implements ApiKeyStore {
  constructor(private readonly db: DrizzleDb) {}

  async insert(record: ApiKeyRecord): Promise<void> {
    await this.db.insert(apiKeys).values({
      id: record.id,
      tenantId: record.tenantId,
      userId: record.userId || null,
      name: record.name,
      hashedKey: record.hashedKey,
      prefix: record.prefix,
      scopes: record.scopes,
      active: record.active,
      expiresAt: record.expiresAt ?? null,
      rotatedFromId: record.rotatedFromId ?? null,
      revokedAt: record.revokedAt ?? null,
    });
  }

  async findByHash(hashedKey: string): Promise<ApiKeyRecord | null> {
    const [row] = await this.db.select().from(apiKeys).where(eq(apiKeys.hashedKey, hashedKey)).limit(1);
    return row ? toRecord(row) : null;
  }

  async findById(id: string): Promise<ApiKeyRecord | null> {
    const [row] = await this.db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
    return row ? toRecord(row) : null;
  }

  async revoke(id: string, at: Date): Promise<void> {
    await this.db.update(apiKeys).set({ active: false, revokedAt: at, updatedAt: at }).where(eq(apiKeys.id, id));
  }

  async touch(id: string, at: Date): Promise<void> {
    await this.db.update(apiKeys).set({ lastUsedAt: at }).where(eq(apiKeys.id, id));
  }
}
