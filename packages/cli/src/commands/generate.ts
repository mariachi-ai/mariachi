import type { Command } from 'commander';
import {
  generateService,
  generateController,
  generateJob,
  generateIntegration,
} from '@mariachi/create';

const GENERATOR_TYPES = ['service', 'controller', 'job', 'integration'] as const;

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate <type> <name>')
    .description('Generate a Mariachi component (service, controller, job, integration)')
    .option('-p, --project-root <path>', 'Project root directory', process.cwd())
    .action(async (type: string, name: string, opts: { projectRoot?: string }) => {
      const projectRoot = opts.projectRoot ?? process.cwd();
      const normalizedType = type.toLowerCase();

      if (!GENERATOR_TYPES.includes(normalizedType as (typeof GENERATOR_TYPES)[number])) {
        console.error(`Unknown type: ${type}. Must be one of: ${GENERATOR_TYPES.join(', ')}`);
        process.exit(1);
      }

      let paths: string[];
      switch (normalizedType) {
        case 'service':
          paths = await generateService({ name, projectRoot });
          break;
        case 'controller':
          paths = await generateController({ name, projectRoot });
          break;
        case 'job':
          paths = await generateJob({ name, projectRoot });
          break;
        case 'integration':
          paths = await generateIntegration({ name, projectRoot });
          break;
        default:
          paths = [];
      }

      for (const p of paths) {
        console.log(p);
      }
    });
}
