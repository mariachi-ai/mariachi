export interface SecretsAdapter {
  get(key: string, tenantId?: string): Promise<string | undefined>;
  set(key: string, value: string, tenantId?: string): Promise<void>;
}

export interface FlagContext {
  tenantId?: string | null;
  userId?: string | null;
}

export interface FeatureFlagAdapter {
  isEnabled(flag: string, context?: FlagContext): Promise<boolean>;
  getVariant(flag: string, context?: FlagContext): Promise<string | undefined>;
  /** Drops cached flag values in this process (one flag, or all). No-op for uncached adapters. */
  invalidate?(flag?: string): void;
}

/** Shape of a row in the `feature_flags` table. */
export interface FeatureFlagRecord {
  key: string;
  enabled: boolean;
  /** `{ [tenantId]: boolean | { enabled?: boolean; variant?: string } }` */
  tenantOverrides?: Record<string, boolean | { enabled?: boolean; variant?: string }> | null;
  /** `{ variant?: string; rolloutPercent?: number; users?: string[] }` */
  metadata?: { variant?: string; rolloutPercent?: number; users?: string[] } | null;
}

/** Where flags are read from. `@mariachi/database-postgres` users back this with a repository. */
export interface FeatureFlagStore {
  get(key: string): Promise<FeatureFlagRecord | null>;
}

export type TenantFlagOverride = boolean | { enabled?: boolean; variant?: string };

export interface ConfigOptions {
  secrets: { adapter: string; [key: string]: unknown };
  flags?: { adapter: string; [key: string]: unknown };
  env?: string;
}
