import { existsSync } from 'node:fs';
import { Command } from 'commander';
import { MARIACHI_VERSION } from '@mariachi/create';
import { registerInitCommand } from './commands/init';
import { registerGenerateCommand } from './commands/generate';
import { registerValidateCommand } from './commands/validate';
import { registerDbCommand } from './commands/db';

// Variables already set in the environment win over the file.
if (existsSync('.env')) process.loadEnvFile('.env');

const program = new Command()
  .name('mariachi')
  .description('Mariachi Framework CLI')
  .version(MARIACHI_VERSION);

registerInitCommand(program);
registerGenerateCommand(program);
registerValidateCommand(program);
registerDbCommand(program);

program.parse();
