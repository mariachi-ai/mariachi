export type HookPriority = number;

export interface StartupHook {
  name: string;
  /** Lower runs first on startup. */
  priority: HookPriority;
  fn: () => Promise<void>;
}

export interface ShutdownHook {
  name: string;
  /** Higher runs first on shutdown, so shutdown mirrors startup order. */
  priority: HookPriority;
  fn: () => Promise<void>;
  timeoutMs?: number;
}

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  message?: string;
  latencyMs: number;
}

export interface HealthCheck {
  name: string;
  fn: () => Promise<HealthCheckResult | HealthStatus | boolean>;
  /** Failure makes readiness `degraded` instead of `unhealthy`. */
  critical?: boolean;
  timeoutMs?: number;
}

export interface HealthReport {
  status: HealthStatus;
  checks: HealthCheckResult[];
}
