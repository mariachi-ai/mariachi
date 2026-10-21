import { basename, relative, resolve } from 'node:path';
import type { Command } from 'commander';
import { createProject, PROJECT_AUTH, type ProjectAuth } from '@mariachi/create';
import { DIM, GREEN, RESET } from '../colors';
import { fail, printResult } from '../output';

export function registerInitCommand(program: Command): void {
  program
    .command('init <directory>')
    .description('Create a new Mariachi project (API, services, jobs, schema) in <directory>')
    .option('-n, --name <name>', 'package name (default: directory name)')
    .option('--no-example', 'skip the example "note" entity')
    .option('--mariachi-version <range>', 'version range for @mariachi/* dependencies')
    .option('--auth <provider>', 'how users sign in: jwt (HS256 tokens from JWT_SECRET) or ensemble (Ensemble login: GoTrue, orgs as tenants)', 'jwt')
    .action(async (directory: string, opts: { name?: string; example: boolean; mariachiVersion?: string; auth: string }) => {
      try {
        const outputDir = resolve(directory);
        const name = opts.name ?? basename(outputDir);
        const auth = opts.auth as ProjectAuth;
        const result = await createProject({ name, outputDir, example: opts.example, mariachiVersion: opts.mariachiVersion, auth });
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
        if (auth === 'ensemble') {
          console.log(`\n  Sign-in is Ensemble's: commit drizzle/, then create the environment from ${DIM}ensemble.environment.json${RESET} (see README.md).`);
        }
      } catch (error) {
        fail(error);
      }
    });
}
