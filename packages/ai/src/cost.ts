import type { CostTable } from './types';

/** USD per 1K tokens. Extend or override it with `ai.costTable` in config. */
export const DEFAULT_COST_TABLE: CostTable = {
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
};

/**
 * Rates for `model`: an exact entry, else the longest entry that prefixes it (so a dated id such as
 * `gpt-4o-2024-08-06` uses `gpt-4o`). `table` is merged over the defaults. Undefined when unknown.
 */
export function resolveRates(model: string, table?: CostTable): { input: number; output: number } | undefined {
  const merged = table ? { ...DEFAULT_COST_TABLE, ...table } : DEFAULT_COST_TABLE;
  if (merged[model]) return merged[model];
  let best: string | undefined;
  for (const key of Object.keys(merged)) {
    if (model.startsWith(key) && (!best || key.length > best.length)) best = key;
  }
  return best ? merged[best] : undefined;
}

/** Estimated USD cost. Unknown models cost 0; `DefaultAI` logs a warning for them. */
export function estimateCost(model: string, inputTokens: number, outputTokens: number, table?: CostTable): number {
  const rates = resolveRates(model, table);
  if (!rates) return 0;
  return (inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output;
}
