export type HookPriority = number;

export interface StartupHook {
  name: string;
  priority: HookPriority;
  fn: () => Promise<void>;
}

export interface ShutdownHook {
  name: string;
  priority: HookPriority;
  fn: () => Promise<void>;
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
  fn: () => Promise<HealthCheckResult>;
}
