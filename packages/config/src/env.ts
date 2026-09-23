import { ConfigError } from '@mariachi/core';
import type { AppConfigInput } from './schema';

type Env = Record<string, string | undefined>;

function num(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function bool(v: string | undefined): boolean | undefined {
  if (v === undefined || v === '') return undefined;
  return v === 'true' || v === '1';
}

function list(v: string | undefined): string[] | undefined {
  if (!v) return undefined;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Parses a JSON variable. Invalid JSON is a config error, not a silent default. */
function json<T>(v: string | undefined, name: string): T | undefined {
  if (!v) return undefined;
  try {
    return JSON.parse(v) as T;
  } catch {
    throw new ConfigError('config/invalid-json', `${name} is not valid JSON`);
  }
}

function compact<T extends Record<string, unknown>>(obj: T): T | undefined {
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
}

/** Maps well-known environment variables onto the config shape. The only place `process.env` is read. */
export function buildConfigFromEnv(env: Env = process.env): AppConfigInput {
  const nodeEnv = env.ENV ?? env.NODE_ENV;
  return {
    env: nodeEnv === 'development' || nodeEnv === 'test' || nodeEnv === 'production' ? nodeEnv : undefined,
    serviceName: env.SERVICE_NAME,
    server: compact({
      host: env.HOST,
      port: num(env.PORT),
      adminPort: num(env.ADMIN_PORT),
      webhookPort: num(env.WEBHOOK_PORT),
      trustProxy: bool(env.TRUST_PROXY),
      bodyLimitBytes: num(env.BODY_LIMIT_BYTES),
      corsOrigins: list(env.CORS_ORIGINS),
      shutdownTimeoutMs: num(env.SHUTDOWN_TIMEOUT_MS),
    }),
    database: env.DATABASE_URL
      ? compact({
          url: env.DATABASE_URL,
          adapter: env.DATABASE_ADAPTER,
          poolMin: num(env.DATABASE_POOL_MIN),
          poolMax: num(env.DATABASE_POOL_MAX),
        }) as NonNullable<AppConfigInput['database']>
      : undefined,
    redis: env.REDIS_URL ? { url: env.REDIS_URL } : undefined,
    auth: compact({
      adapter: env.AUTH_ADAPTER,
      jwtSecret: env.JWT_SECRET,
      jwtIssuer: env.JWT_ISSUER,
      jwtAudience: env.JWT_AUDIENCE,
      jwtExpiresIn: env.JWT_EXPIRES_IN,
      sessionSecret: env.SESSION_SECRET,
    }),
    encryption: compact({
      adapter: env.ENCRYPTION_ADAPTER as 'local' | 'aws-kms' | 'gcp-kms' | undefined,
      key: env.ENCRYPTION_KEY,
      keyVersion: num(env.ENCRYPTION_KEY_VERSION),
    }),
    storage: compact({
      adapter: env.STORAGE_ADAPTER,
      bucket: env.STORAGE_BUCKET ?? env.S3_BUCKET,
      region: env.STORAGE_REGION ?? env.AWS_REGION,
      basePath: env.STORAGE_BASE_PATH,
    }),
    billing: compact({
      adapter: env.BILLING_ADAPTER,
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    }),
    email: compact({
      adapter: env.EMAIL_ADAPTER,
      apiKey: env.RESEND_API_KEY,
      from: env.EMAIL_FROM,
      smtpUrl: env.SMTP_URL,
    }),
    search: compact({
      adapter: env.SEARCH_ADAPTER,
      url: env.TYPESENSE_URL,
      apiKey: env.TYPESENSE_API_KEY,
    }),
    ai: compact({
      adapter: env.AI_ADAPTER,
      apiKey: env.AI_API_KEY ?? env.OPENAI_API_KEY,
      model: env.AI_MODEL,
      fallbackModels: list(env.AI_FALLBACK_MODELS),
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      costTable: json(env.AI_COST_TABLE, 'AI_COST_TABLE'),
    }),
    observability: compact({
      logging: compact({
        adapter: env.LOG_ADAPTER as 'pino' | 'console' | undefined,
        level: env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error' | undefined,
      }),
      tracing: compact({
        adapter: env.TRACING_ADAPTER as 'noop' | 'otel' | undefined,
        endpoint: env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? env.OTEL_EXPORTER_OTLP_ENDPOINT,
      }),
      metrics: compact({
        adapter: env.METRICS_ADAPTER as 'noop' | 'prometheus' | undefined,
        prefix: env.METRICS_PREFIX,
      }),
      errors: compact({
        adapter: (env.ERRORS_ADAPTER ?? (env.SENTRY_DSN ? 'sentry' : undefined)) as 'noop' | 'sentry' | undefined,
        dsn: env.SENTRY_DSN,
      }),
    }),
  };
}

/** Raw env lookup for package-registered sections. */
export function readEnv(key: string): string | undefined {
  return process.env[key];
}
