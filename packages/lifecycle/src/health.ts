import type { HealthCheck, HealthCheckResult, HealthStatus } from './types';

const STATUS_ORDER: Record<HealthStatus, number> = {
  healthy: 0,
  degraded: 1,
  unhealthy: 2,
};

function worstStatus(a: HealthStatus, b: HealthStatus): HealthStatus {
  return STATUS_ORDER[a] >= STATUS_ORDER[b] ? a : b;
}

export class HealthManager {
  private checks: HealthCheck[] = [];

  register(check: HealthCheck): void {
    this.checks.push(check);
  }

  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  async readiness(): Promise<{ status: HealthStatus; checks: HealthCheckResult[] }> {
    return this.runChecks();
  }

  async startup(): Promise<{ status: HealthStatus; checks: HealthCheckResult[] }> {
    return this.runChecks();
  }

  private async runChecks(): Promise<{
    status: HealthStatus;
    checks: HealthCheckResult[];
  }> {
    const results: HealthCheckResult[] = [];
    let overall: HealthStatus = 'healthy';

    for (const check of this.checks) {
      const start = performance.now();
      try {
        const result = await check.fn();
        result.latencyMs = Math.round(performance.now() - start);
        results.push(result);
        overall = worstStatus(overall, result.status);
      } catch (err) {
        const latencyMs = Math.round(performance.now() - start);
        results.push({
          name: check.name,
          status: 'unhealthy',
          message: err instanceof Error ? err.message : String(err),
          latencyMs,
        });
        overall = 'unhealthy';
      }
    }

    return { status: overall, checks: results };
  }
}
