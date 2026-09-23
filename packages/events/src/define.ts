import type { ZodType } from 'zod';
import type { EventDefinition } from './types';

/**
 * Declares an event. With a schema, payloads are validated on publish and again on receipt, and
 * `publish`/`subscribe` infer the payload type.
 */
export function defineEvent<T>(name: string, options: { schema?: ZodType<T>; description?: string } = {}): EventDefinition<T> {
  return { name, schema: options.schema, description: options.description };
}
