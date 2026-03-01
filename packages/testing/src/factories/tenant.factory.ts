import type { BaseEntity } from '../types';

export interface TestTenant extends BaseEntity {
  name: string;
  slug: string;
  plan: string | null;
}

export function createTestTenant(overrides?: Partial<TestTenant>): TestTenant {
  const now = new Date();
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    name: overrides?.name ?? 'Test Tenant',
    slug: overrides?.slug ?? 'test-tenant',
    plan: overrides?.plan ?? null,
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
    deletedAt: overrides?.deletedAt ?? null,
  };
}
