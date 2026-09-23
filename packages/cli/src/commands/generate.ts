import { resolve } from 'node:path';
import type { Command } from 'commander';
import {
  generateController,
  generateEntity,
  generateIntegration,
  generateJob,
  generateService,
  type GenerateOptions,
  type GenerateResult,
} from '@mariachi/create';
import { ConfigError } from '@mariachi/core';
import { fail, printResult } from '../output';

const GENERATORS: Record<string, (options: GenerateOptions) => Promise<GenerateResult>> = {
  entity: generateEntity,
  service: generateService,
  controller: generateController,
  job: generateJob,
  integration: generateIntegration,
};

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate <type> <name>')
    .alias('g')
    .description(`Generate code into src/ (${Object.keys(GENERATORS).join(', ')})`)
    .option('-p, --project-root <path>', 'project root', '.')
    .option('-f, --force', 'overwrite existing files')
    .action(async (type: string, name: string, opts: { projectRoot: string; force?: boolean }) => {
      try {
        const generator = GENERATORS[type.toLowerCase()];
        if (!generator) {
          throw new ConfigError('cli/unknown-generator', `Unknown type "${type}". Use one of: ${Object.keys(GENERATORS).join(', ')}`);
        }
        printResult(await generator({ name, projectRoot: resolve(opts.projectRoot), force: opts.force }));
      } catch (error) {
        fail(error);
      }
    });
}
