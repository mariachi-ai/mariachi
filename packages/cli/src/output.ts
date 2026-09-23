import type { GenerateResult } from '@mariachi/create';
import { DIM, GREEN, RED, RESET, YELLOW } from './colors';

export function fail(err: unknown): never {
  console.error(`${RED}error${RESET} ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

export function printResult(result: GenerateResult): void {
  for (const file of result.created) console.log(`${GREEN}created${RESET} ${file}`);
  for (const file of result.updated) console.log(`${DIM}updated${RESET} ${file}`);
  for (const note of result.notes) console.log(`${YELLOW}note${RESET}    ${note}`);
}
