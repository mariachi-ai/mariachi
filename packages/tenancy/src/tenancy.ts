import type { Context, Logger, TracerAdapter, MetricsAdapter } from '@mariachi/core';
import { getContainer, KEYS } from '@mariachi/core';
import type { Instrumentable } from '@mariachi/core';
import type { TenantResolver, TenantResolverInput } from './types';

export abstract class Tenancy implements Instrumentable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly resolver: TenantResolver;

  constructor(config: { resolver: TenantResolver }) {
    const container = getContainer();
    this.logger = container.resolve<Logger>(KEYS.Logger);
    this.tracer = container.has(KEYS.Tracer) ? container.resolve<TracerAdapter>(KEYS.Tracer) : undefined;
    this.metrics = container.has(KEYS.Metrics) ? container.resolve<MetricsAdapter>(KEYS.Metrics) : undefined;
    this.resolver = config.resolver;
  }

  resolve(ctx: Context, input: TenantResolverInput): string | null {
    const tenantId = this.resolver.resolve(input);
    if (tenantId) {
      this.logger.debug({ traceId: ctx.traceId, tenantId }, 'Tenant resolved');
      this.metrics?.increment('tenancy.resolved', 1);
    } else {
      this.metrics?.increment('tenancy.unresolved', 1);
    }
    return tenantId;
  }
}

export class DefaultTenancy extends Tenancy {}
