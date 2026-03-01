export interface SecretsAdapter {
  get(key: string, tenantId?: string): Promise<string | undefined>;
  set(key: string, value: string, tenantId?: string): Promise<void>;
}

export interface FeatureFlagAdapter {
  isEnabled(
    flag: string,
    context?: { tenantId?: string; userId?: string }
  ): Promise<boolean>;
  getVariant(
    flag: string,
    context?: { tenantId?: string; userId?: string }
  ): Promise<string | undefined>;
}

export interface ConfigOptions {
  secrets: { adapter: string; [key: string]: unknown };
  flags?: { adapter: string; [key: string]: unknown };
  env?: string;
}
