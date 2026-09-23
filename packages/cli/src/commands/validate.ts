import { resolve } from 'node:path';
import type { Command } from 'commander';
import { RULES, validate } from '@mariachi/create';
import { DIM, GREEN, RED, RESET, YELLOW } from '../colors';
import { fail } from '../output';

export function registerValidateCommand(program: Command): void {
  program
    .command('validate [path]')
    .description('Check the project against Mariachi architecture rules (exit 1 on errors)')
    .option('-d, --disable <rules...>', 'rules to skip')
    .option('--strict', 'treat warnings as errors')
    .option('--list', 'print the rules and exit')
    .option('--json', 'machine-readable output')
    .action(async (path: string | undefined, opts: { disable?: string[]; strict?: boolean; list?: boolean; json?: boolean }) => {
      try {
        if (opts.list) {
          for (const rule of RULES) console.log(`${rule.name.padEnd(34)} ${DIM}${rule.description}${RESET}`);
          return;
        }
        const result = await validate(resolve(path ?? '.'), { disable: opts.disable });
        const failed = !result.valid || (opts.strict === true && result.violations.length > 0);
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          for (const v of result.violations) {
            const color = v.severity === 'error' ? RED : YELLOW;
            const location = v.line ? `${v.file}:${v.line}` : v.file;
            console.log(`${color}${v.severity}${RESET} ${location} ${DIM}${v.rule}${RESET}\n  ${v.message}`);
            if (v.suggestion) console.log(`  ${DIM}→ ${v.suggestion}${RESET}`);
          }
          const errors = result.violations.filter((v) => v.severity === 'error').length;
          const warnings = result.violations.length - errors;
          const summary = `${result.filesChecked} files, ${errors} error(s), ${warnings} warning(s)`;
          console.log(failed ? `\n${RED}${summary}${RESET}` : `\n${GREEN}${summary}${RESET}`);
        }
        if (failed) process.exitCode = 1;
      } catch (error) {
        fail(error);
      }
    });
}
