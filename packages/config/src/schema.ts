import { z } from 'zod';

export const AppConfigSchema = z.object({
  env: z.enum(['development', 'test', 'production']).default('development'),
  database: z.object({
    adapter: z.string().default('postgres'),
    url: z.string().url(),
    poolMin: z.number().default(2),
    poolMax: z.number().default(10),
  }),
  redis: z
    .object({
      url: z.string().url(),
    })
    .optional(),
  auth: z
    .object({
      adapter: z.string().default('jwt'),
      jwtSecret: z.string().min(32).optional(),
      sessionSecret: z.string().min(32).optional(),
    })
    .optional(),
  storage: z
    .object({
      adapter: z.string().default('local'),
      bucket: z.string().optional(),
      region: z.string().optional(),
    })
    .optional(),
  billing: z
    .object({
      adapter: z.string().default('stripe'),
    })
    .optional(),
  search: z
    .object({
      adapter: z.string().default('postgres-fts'),
    })
    .optional(),
  ai: z
    .object({
      adapter: z.string().default('openai'),
    })
    .optional(),
  observability: z
    .object({
      logging: z
        .object({
          adapter: z.string().default('pino'),
          level: z
            .enum(['debug', 'info', 'warn', 'error'])
            .default('info'),
        })
        .optional(),
      tracing: z
        .object({
          adapter: z.string().default('otel'),
          endpoint: z.string().optional(),
        })
        .optional(),
      metrics: z
        .object({
          adapter: z.string().default('prometheus'),
        })
        .optional(),
      errors: z
        .object({
          adapter: z.string().default('sentry'),
          dsn: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
