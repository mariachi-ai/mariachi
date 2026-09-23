import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuthError } from '@mariachi/core';
import type { AuthenticationAdapter, ResolvedIdentity, SessionInfo } from './types';

export interface SessionRecord extends SessionInfo {
  /** sha256 of the opaque token. The plaintext token is never stored. */
  tokenHash: string;
}

export interface SessionStore {
  create(record: SessionRecord): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  touch(id: string, lastActiveAt: Date, expiresAt: Date): Promise<void>;
  revoke(id: string): Promise<void>;
  revokeAllForUser(userId: string, tenantId?: string): Promise<number>;
  listForUser(userId: string, tenantId?: string): Promise<SessionRecord[]>;
}

export interface SessionManagerOptions {
  /** Absolute lifetime. Default 30 days. */
  ttlSeconds?: number;
  /** Extend expiry on activity up to `ttlSeconds` from last use. Default true. */
  sliding?: boolean;
  /** Minimum interval between `touch` writes. Default 60s. */
  touchIntervalSeconds?: number;
}

export const hashSessionToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Opaque, revocable server-side sessions. Tokens are random 256-bit values; only hashes are stored. */
export class SessionManager implements AuthenticationAdapter {
  private readonly ttlMs: number;
  private readonly sliding: boolean;
  private readonly touchIntervalMs: number;

  constructor(
    private readonly store: SessionStore,
    options: SessionManagerOptions = {},
  ) {
    this.ttlMs = (options.ttlSeconds ?? 30 * 24 * 3600) * 1000;
    this.sliding = options.sliding ?? true;
    this.touchIntervalMs = (options.touchIntervalSeconds ?? 60) * 1000;
  }

  async create(input: {
    userId: string;
    tenantId: string;
    scopes?: string[];
    userAgent?: string;
    ipAddress?: string;
  }): Promise<{ token: string; session: SessionInfo }> {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const record: SessionRecord = {
      id: randomUUID(),
      tokenHash: hashSessionToken(token),
      userId: input.userId,
      tenantId: input.tenantId,
      scopes: input.scopes ?? [],
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      createdAt: now,
      lastActiveAt: now,
      expiresAt: new Date(now.getTime() + this.ttlMs),
      revokedAt: null,
    };
    await this.store.create(record);
    const { tokenHash: _omit, ...session } = record;
    return { token, session };
  }

  async verify(token: string): Promise<ResolvedIdentity> {
    const record = await this.store.findByTokenHash(hashSessionToken(token));
    const now = Date.now();
    if (!record || record.revokedAt) throw new AuthError('auth/invalid-session', 'Invalid session');
    if (record.expiresAt.getTime() <= now) throw new AuthError('auth/session-expired', 'Session expired');
    if (this.sliding && now - record.lastActiveAt.getTime() > this.touchIntervalMs) {
      const expiresAt = new Date(Math.max(record.expiresAt.getTime(), now + this.ttlMs));
      await this.store.touch(record.id, new Date(now), expiresAt);
    }
    return {
      userId: record.userId,
      tenantId: record.tenantId,
      scopes: record.scopes,
      identityType: 'session',
      sessionId: record.id,
    };
  }

  async sign(): Promise<string> {
    throw new AuthError('auth/not-supported', 'Use SessionManager.create() to issue sessions');
  }

  revoke(sessionId: string): Promise<void> {
    return this.store.revoke(sessionId);
  }

  revokeAllForUser(userId: string, tenantId?: string): Promise<number> {
    return this.store.revokeAllForUser(userId, tenantId);
  }

  async list(userId: string, tenantId?: string): Promise<SessionInfo[]> {
    const records = await this.store.listForUser(userId, tenantId);
    return records.filter((r) => !r.revokedAt).map(({ tokenHash: _omit, ...rest }) => rest);
  }
}

export class InMemorySessionStore implements SessionStore {
  private readonly byId = new Map<string, SessionRecord>();

  async create(record: SessionRecord): Promise<void> {
    this.byId.set(record.id, { ...record });
  }
  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    for (const r of this.byId.values()) if (r.tokenHash === tokenHash) return { ...r };
    return null;
  }
  async touch(id: string, lastActiveAt: Date, expiresAt: Date): Promise<void> {
    const r = this.byId.get(id);
    if (r) Object.assign(r, { lastActiveAt, expiresAt });
  }
  async revoke(id: string): Promise<void> {
    const r = this.byId.get(id);
    if (r) r.revokedAt = new Date();
  }
  async revokeAllForUser(userId: string, tenantId?: string): Promise<number> {
    let n = 0;
    for (const r of this.byId.values()) {
      if (r.userId === userId && (!tenantId || r.tenantId === tenantId) && !r.revokedAt) {
        r.revokedAt = new Date();
        n++;
      }
    }
    return n;
  }
  async listForUser(userId: string, tenantId?: string): Promise<SessionRecord[]> {
    return [...this.byId.values()].filter((r) => r.userId === userId && (!tenantId || r.tenantId === tenantId));
  }
}
