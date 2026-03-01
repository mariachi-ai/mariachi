import { Command } from 'commander';
import { registerInitCommand } from './commands/init';
import { registerGenerateCommand } from './commands/generate';
import { registerValidateCommand } from './commands/validate';

const program = new Command()
  .name('mariachi')
  .description('Mariachi Framework CLI')
  .version('0.1.0');

registerInitCommand(program);
registerGenerateCommand(program);
registerValidateCommand(program);

program.parse();
