import type { WebhookIdentity } from '../auth/auth-controller';

export interface WebhookLogIdentity {
  type: string;
  id?: string;
  [key: string]: unknown;
}

export type WebhookLogStatus = 'received' | 'processed' | 'failed';

export interface WebhookLogEntry {
  id: string;
  route: string;
  controller: string;
  method: string;
  headers: Record<string, string>;
  payload: unknown;
  identity: WebhookIdentity | null;
  status: 'received' | 'processed' | 'failed';
  response?: unknown;
  error?: string;
  ttl: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface WebhookLogStore {
  log(entry: Omit<WebhookLogEntry, 'id' | 'createdAt' | 'expiresAt'>): Promise<string>;
  update(id: string, patch: Partial<Pick<WebhookLogEntry, 'status' | 'response' | 'error'>>): Promise<void>;
  query(filter: { route?: string; controller?: string; status?: string }): Promise<WebhookLogEntry[]>;
  /** Delete expired entries; returns number of rows removed. */
  cleanup(): Promise<number>;
}
