import type { Command } from 'commander';
import { validate } from '@mariachi/create';

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

export function registerValidateCommand(program: Command): void {
  program
    .command('validate [path]')
    .description('Validate project against Mariachi conventions')
    .action(async (path?: string) => {
      const targetPath = path ?? process.cwd();
      const result = await validate(targetPath);

      for (const v of result.violations) {
        const color = v.severity === 'error' ? RED : YELLOW;
        const prefix = v.severity === 'error' ? 'error' : 'warning';
        console.error(`${color}[${prefix}] ${v.rule}${RESET} ${v.file}: ${v.message}`);
        if (v.suggestion) {
          console.error(`  ${color}→ ${v.suggestion}${RESET}`);
        }
      }

      const hasErrors = result.violations.some((v) => v.severity === 'error');
      if (hasErrors) {
        process.exit(1);
      }
    });
}
