import type { Context } from '@mariachi/core';

export interface SeedDefinition<TDb = unknown> {
  /** Unique, stable name; seeds run once per database and are recorded by name. */
  name: string;
  /** Environments this seed may run in. Default: all except production. */
  environments?: string[];
  run(ctx: Context, db: TDb): Promise<void>;
}

export function defineSeed<TDb = unknown>(seed: SeedDefinition<TDb>): SeedDefinition<TDb> {
  return seed;
}
