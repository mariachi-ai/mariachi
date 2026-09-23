import { basename, relative, resolve } from 'node:path';
import type { Command } from 'commander';
import { createProject } from '@mariachi/create';
import { DIM, GREEN, RESET } from '../colors';
import { fail, printResult } from '../output';

export function registerInitCommand(program: Command): void {
  program
    .command('init <directory>')
    .description('Create a new Mariachi project (API, services, jobs, schema) in <directory>')
    .option('-n, --name <name>', 'package name (default: directory name)')
    .option('--no-example', 'skip the example "note" entity')
    .option('--mariachi-version <range>', 'version range for @mariachi/* dependencies')
    .action(async (directory: string, opts: { name?: string; example: boolean; mariachiVersion?: string }) => {
      try {
        const outputDir = resolve(directory);
        const name = opts.name ?? basename(outputDir);
        const result = await createProject({ name, outputDir, example: opts.example, mariachiVersion: opts.mariachiVersion });
        printResult(result);
        const cd = relative(process.cwd(), outputDir) || '.';
        console.log(`\n${GREEN}Created ${name}.${RESET} Next steps:\n`);
        for (const step of [
          `cd ${cd}`,
          'cp .env.example .env',
          'docker compose up -d',
          'pnpm install',
          'pnpm db:generate && pnpm db:migrate',
          'pnpm dev',
        ]) {
          console.log(`  ${DIM}$${RESET} ${step}`);
        }
      } catch (error) {
        fail(error);
      }
    });
}
