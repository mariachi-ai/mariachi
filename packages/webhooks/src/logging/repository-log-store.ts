import type { Context } from '@mariachi/core';
import type { Repository } from '@mariachi/database';
import type { WebhookLogEntry, WebhookLogStore } from './types';

function parseTtl(ttl: string): number {
  const match = ttl.match(/^(\d+)([dhms])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    d: 24 * 60 * 60 * 1000,
    h: 60 * 60 * 1000,
    m: 60 * 1000,
    s: 1000,
  };
  return value * (multipliers[unit] ?? 24 * 60 * 60 * 1000);
}

export class RepositoryWebhookLogStore implements WebhookLogStore {
  constructor(
    private readonly repository: Repository<WebhookLogEntry>,
    private readonly ctx: Context,
  ) {}

  async log(entry: Omit<WebhookLogEntry, 'id' | 'createdAt' | 'expiresAt'>): Promise<string> {
    const now = new Date();
    const ttlMs = parseTtl(entry.ttl);
    const expiresAt = new Date(now.getTime() + ttlMs);

    const created = await this.repository.create(this.ctx, {
      route: entry.route,
      controller: entry.controller,
      method: entry.method,
      headers: entry.headers,
      payload: entry.payload,
      identity: entry.identity,
      status: entry.status,
      response: entry.response,
      error: entry.error,
      ttl: entry.ttl,
      createdAt: now,
      expiresAt,
    });

    return created.id;
  }

  async update(
    id: string,
    patch: Partial<Pick<WebhookLogEntry, 'status' | 'response' | 'error'>>,
  ): Promise<void> {
    if (Object.keys(patch).length === 0) return;
    await this.repository.update(this.ctx, id, patch);
  }

  async query(filter: {
    route?: string;
    controller?: string;
    status?: string;
  }): Promise<WebhookLogEntry[]> {
    const partial: Partial<WebhookLogEntry> = {};
    if (filter.route) partial.route = filter.route;
    if (filter.controller) partial.controller = filter.controller;
    if (filter.status) partial.status = filter.status as WebhookLogEntry['status'];

    return this.repository.findMany(
      this.ctx,
      partial,
      { field: 'createdAt', direction: 'asc' },
    );
  }

  async cleanup(): Promise<number> {
    return this.repository.deleteWhere(this.ctx, [
      { field: 'expiresAt', op: 'lte', value: new Date() },
    ]);
  }
}
