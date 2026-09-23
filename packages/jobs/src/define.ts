import type { JobDefinition } from './types';

/** Declares a job. The schema validates payloads at enqueue time and again in the worker. */
export function defineJob<T>(definition: JobDefinition<T>): JobDefinition<T> {
  return definition;
}
