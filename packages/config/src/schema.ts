import { z } from 'zod';

const port = z.coerce.number().int().min(0).max(65535);

export const AppConfigSchema = z.object({
  env: z.enum(['development', 'test', 'production']).default('development'),
  serviceName: z.string().default('mariachi'),
  server: z
    .object({
      host: z.string().default('0.0.0.0'),
      port: port.default(3000),
      adminPort: port.default(3001),
      webhookPort: port.default(3002),
      trustProxy: z.boolean().default(false),
      bodyLimitBytes: z.number().int().positive().default(1_048_576),
      corsOrigins: z.array(z.string()).default([]),
      shutdownTimeoutMs: z.number().int().positive().default(15_000),
    })
    .default({}),
  database: z
    .object({
      adapter: z.string().default('postgres'),
      url: z.string().url(),
      poolMin: z.number().int().min(0).default(2),
      poolMax: z.number().int().min(1).default(10),
    })
    .optional(),
  redis: z
    .object({
      url: z.string().url(),
    })
    .optional(),
  auth: z
    .object({
      adapter: z.string().default('jwt'),
      jwtSecret: z.string().min(32).optional(),
      jwtIssuer: z.string().optional(),
      jwtAudience: z.string().optional(),
      jwtExpiresIn: z.string().default('1h'),
      sessionSecret: z.string().min(32).optional(),
    })
    .optional(),
  encryption: z
    .object({
      adapter: z.enum(['local', 'aws-kms', 'gcp-kms']).default('local'),
      key: z.string().min(32).optional(),
      keyVersion: z.number().int().positive().default(1),
    })
    .optional(),
  storage: z
    .object({
      adapter: z.string().default('local'),
      bucket: z.string().optional(),
      region: z.string().optional(),
      basePath: z.string().optional(),
    })
    .optional(),
  billing: z
    .object({
      adapter: z.string().default('stripe'),
      secretKey: z.string().optional(),
      webhookSecret: z.string().optional(),
    })
    .optional(),
  email: z
    .object({
      adapter: z.string().default('resend'),
      apiKey: z.string().optional(),
      from: z.string().optional(),
      smtpUrl: z.string().optional(),
    })
    .optional(),
  search: z
    .object({
      adapter: z.string().default('typesense'),
      url: z.string().optional(),
      apiKey: z.string().optional(),
    })
    .optional(),
  ai: z
    .object({
      adapter: z.string().default('openai'),
      apiKey: z.string().optional(),
      model: z.string().optional(),
      /** Tried in order on the primary provider when the model fails. */
      fallbackModels: z.array(z.string()).optional(),
      /** For `AnthropicAdapter`, as the primary or a fallback provider. */
      anthropicApiKey: z.string().optional(),
      /** USD per 1K tokens, merged over the built-in table. Keys match model ids or their prefixes. */
      costTable: z.record(z.object({ input: z.number().nonnegative(), output: z.number().nonnegative() })).optional(),
    })
    .optional(),
  observability: z
    .object({
      logging: z
        .object({
          adapter: z.enum(['pino', 'console']).default('pino'),
          level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
        })
        .optional(),
      tracing: z
        .object({
          adapter: z.enum(['noop', 'otel', 'opentelemetry']).default('noop'),
          endpoint: z.string().optional(),
        })
        .optional(),
      metrics: z
        .object({
          adapter: z.enum(['noop', 'prometheus']).default('noop'),
          prefix: z.string().optional(),
        })
        .optional(),
      errors: z
        .object({
          adapter: z.enum(['noop', 'sentry']).default('noop'),
          dsn: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  /** Sections contributed by packages via `registerConfigSection()`. */
  sections: z.record(z.unknown()).default({}),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type AppConfigInput = z.input<typeof AppConfigSchema>;
