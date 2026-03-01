import type { BaseEntity } from '../types';

export interface TestUser extends BaseEntity {
  email: string;
  name: string | null;
  tenantId: string;
}

export function createTestUser(overrides?: Partial<TestUser>): TestUser {
  const now = new Date();
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    email: overrides?.email ?? 'test@example.com',
    name: overrides?.name ?? 'Test User',
    tenantId: overrides?.tenantId ?? 'tenant-1',
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
    deletedAt: overrides?.deletedAt ?? null,
  };
}
