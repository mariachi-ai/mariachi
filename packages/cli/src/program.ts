import { Command } from 'commander';
import { MARIACHI_VERSION } from '@mariachi/create';
import { registerDbCommand } from './commands/db';
import { registerDesignCommand } from './commands/design';
import { registerExploreCommand } from './commands/explore';
import { registerGenerateCommand } from './commands/generate';
import { registerInitCommand } from './commands/init';
import { registerValidateCommand } from './commands/validate';

/**
 * The `mariachi` command tree, without parsing argv. The binary (`index.ts`) parses it; the
 * explorer imports it (`@mariachi/cli/program`) to document every command and option.
 */
export function createProgram(): Command {
  const program = new Command().name('mariachi').description('Mariachi Framework CLI').version(MARIACHI_VERSION);
  registerInitCommand(program);
  registerGenerateCommand(program);
  registerValidateCommand(program);
  registerDbCommand(program);
  registerDesignCommand(program);
  registerExploreCommand(program);
  return program;
}
