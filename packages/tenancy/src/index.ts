export type {
  TenantResolverStrategy,
  TenancyConfig,
  TenantResolver,
  TenantResolverInput,
  TenantRecord,
  TenantStore,
} from './types';

export { createTenantResolver } from './resolver';
export { withTenant } from './context';
export { createTenancyMiddleware, type TenancyContext } from './middleware';
export { Tenancy, DefaultTenancy } from './tenancy';

import type { InstrumentationDeps } from '@mariachi/core';
import type { TenancyConfig } from './types';
import { DefaultTenancy } from './tenancy';

export function createTenancy(config: TenancyConfig, instrumentation?: InstrumentationDeps): DefaultTenancy {
  return new DefaultTenancy(config, instrumentation);
}
