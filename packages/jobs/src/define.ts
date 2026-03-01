import type { z } from 'zod';
import type { JobDefinition, JobContext, RetryConfig } from './types';

export function defineJob<T>(definition: {
  name: string;
  schema: z.ZodType<T>;
  retry: RetryConfig;
  handler: (data: T, ctx: JobContext) => Promise<void>;
}): JobDefinition<T> {
  return definition;
}
