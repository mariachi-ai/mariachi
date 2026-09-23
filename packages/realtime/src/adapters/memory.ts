import type { Backplane, BackplaneMessage, PresenceEntry, PresenceStore } from '../types';

/** Shared in-process hub; give several `MemoryBackplane`s the same hub to simulate instances. */
export class MemoryBackplaneHub {
  readonly handlers = new Set<(m: BackplaneMessage) => void>();
}

export class MemoryBackplane implements Backplane {
  private handler?: (m: BackplaneMessage) => void;

  constructor(private readonly hub = new MemoryBackplaneHub()) {}

  async publish(message: BackplaneMessage): Promise<void> {
    for (const h of this.hub.handlers) h(structuredClone(message));
  }

  onMessage(handler: (message: BackplaneMessage) => void): void {
    this.handler = handler;
  }

  async connect(): Promise<void> {
    if (this.handler) this.hub.handlers.add(this.handler);
  }

  async disconnect(): Promise<void> {
    if (this.handler) this.hub.handlers.delete(this.handler);
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}

/** Single-process presence. Share one instance between `Realtime`s to simulate a cluster. */
export class MemoryPresenceStore implements PresenceStore {
  private readonly conns = new Map<string, PresenceEntry & { expiresAt: number }>();

  private live(): Array<PresenceEntry & { expiresAt: number }> {
    const now = Date.now();
    for (const [id, c] of this.conns) if (c.expiresAt <= now) this.conns.delete(id);
    return [...this.conns.values()];
  }

  async add(entry: PresenceEntry, ttlMs: number): Promise<number> {
    this.conns.set(entry.connectionId, { ...entry, expiresAt: Date.now() + ttlMs });
    return this.countConnections(entry.tenantId, entry.userId);
  }

  async touch(entry: PresenceEntry, ttlMs: number): Promise<void> {
    const c = this.conns.get(entry.connectionId);
    if (c) c.expiresAt = Date.now() + ttlMs;
  }

  async remove(entry: PresenceEntry): Promise<void> {
    this.conns.delete(entry.connectionId);
  }

  async countConnections(tenantId: string | null, userId: string): Promise<number> {
    return this.live().filter((c) => c.tenantId === tenantId && c.userId === userId).length;
  }

  async onlineUsers(tenantId: string | null): Promise<string[]> {
    return [...new Set(this.live().filter((c) => c.tenantId === tenantId).map((c) => c.userId))];
  }

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async isHealthy(): Promise<boolean> {
    return true;
  }
}
