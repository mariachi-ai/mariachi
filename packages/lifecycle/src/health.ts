import { withTimeout } from '@mariachi/core';
import type { HealthCheck, HealthCheckResult, HealthReport, HealthStatus } from './types';

const STATUS_ORDER: Record<HealthStatus, number> = { healthy: 0, degraded: 1, unhealthy: 2 };

function worst(a: HealthStatus, b: HealthStatus): HealthStatus {
  return STATUS_ORDER[a] >= STATUS_ORDER[b] ? a : b;
}

export class HealthManager {
  private checks: HealthCheck[] = [];
  private started = false;
  private draining = false;
  private readonly bootedAt = Date.now();

  register(check: HealthCheck): void {
    this.checks.push(check);
  }

  markStarted(): void {
    this.started = true;
  }

  markDraining(): void {
    this.draining = true;
  }

  /** Is the process alive? Never touches dependencies, so a slow database can't get the pod killed. */
  liveness(): { status: 'ok'; uptimeMs: number } {
    return { status: 'ok', uptimeMs: Date.now() - this.bootedAt };
  }

  /** Has startup finished? Kubernetes startupProbe. */
  async startup(): Promise<HealthReport> {
    return {
      status: this.started ? 'healthy' : 'unhealthy',
      checks: [{ name: 'startup', status: this.started ? 'healthy' : 'unhealthy', latencyMs: 0 }],
    };
  }

  /** Can we take traffic? Runs every registered dependency check. Unhealthy while draining. */
  async readiness(): Promise<HealthReport> {
    if (this.draining) {
      return { status: 'unhealthy', checks: [{ name: 'shutdown', status: 'unhealthy', message: 'draining', latencyMs: 0 }] };
    }
    if (!this.started) {
      return { status: 'unhealthy', checks: [{ name: 'startup', status: 'unhealthy', message: 'starting', latencyMs: 0 }] };
    }
    const results = await Promise.all(this.checks.map((c) => this.run(c)));
    let overall: HealthStatus = 'healthy';
    results.forEach((r, i) => {
      const status = r.status === 'unhealthy' && this.checks[i].critical === false ? 'degraded' : r.status;
      overall = worst(overall, status);
    });
    return { status: overall, checks: results };
  }

  private async run(check: HealthCheck): Promise<HealthCheckResult> {
    const start = performance.now();
    try {
      const raw = await withTimeout(check.fn(), check.timeoutMs ?? 2_000, 'lifecycle/health-timeout');
      const latencyMs = Math.round(performance.now() - start);
      if (typeof raw === 'boolean') return { name: check.name, status: raw ? 'healthy' : 'unhealthy', latencyMs };
      if (typeof raw === 'string') return { name: check.name, status: raw, latencyMs };
      return { ...raw, name: raw.name ?? check.name, latencyMs };
    } catch (err) {
      return {
        name: check.name,
        status: 'unhealthy',
        message: err instanceof Error ? err.message : String(err),
        latencyMs: Math.round(performance.now() - start),
      };
    }
  }
}
