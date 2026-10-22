import type { Command } from 'commander';
import { type CliCommand, cliCommand, validate } from '../data/schema';
import { importWorkspace } from '../lib/node-import';
import { once } from '../lib/repo';

function describe(cmd: Command, parentPath: string): CliCommand {
  const path = parentPath ? `${parentPath} ${cmd.name()}` : cmd.name();
  return {
    name: cmd.name(),
    path,
    aliases: cmd.aliases(),
    description: cmd.description(),
    usage: `${path} ${cmd.usage()}`.trim(),
    arguments: cmd.registeredArguments.map((a) => ({
      name: a.name(),
      required: a.required,
      variadic: a.variadic,
      description: a.description ?? '',
    })),
    options: cmd.options
      .filter((o) => !o.hidden)
      .map((o) => ({
        flags: o.flags,
        description: o.description ?? '',
        defaultValue: o.defaultValue === undefined ? null : JSON.stringify(o.defaultValue),
      })),
    subcommands: cmd.commands.map((c) => describe(c as Command, path)),
  };
}

/** The `mariachi` command tree, read from the CLI's own definitions (`@mariachi/cli/program`). */
export const loadCli = once(async (): Promise<CliCommand> => {
  const { createProgram } = await importWorkspace<typeof import('@mariachi/cli/program')>('@mariachi/cli/program');
  return validate(cliCommand, describe(createProgram(), ''), '@mariachi/cli/program');
});
