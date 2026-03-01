import type { Context } from '@mariachi/core';
import { createContext } from '@mariachi/core';

export function withTenant(ctx: Context, tenantId: string): Context {
  return createContext({
    ...ctx,
    tenantId,
    logger: ctx.logger.child({ tenantId }),
  });
}
