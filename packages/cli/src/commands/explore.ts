import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Command } from 'commander';
import { ConfigError } from '@mariachi/core';
import { DIM, GREEN, RESET } from '../colors';
import { createStaticServer } from '../explore/serve';
import { fail } from '../output';

/** The built explorer site from an installed @mariachi/explorer (optional peer dependency). */
export function explorerSite(cwd: string): string {
  for (const from of [path.join(cwd, 'package.json'), import.meta.url]) {
    try {
      const pkg = createRequire(from).resolve('@mariachi/explorer/package.json');
      const site = path.join(path.dirname(pkg), 'dist', 'site');
      if (fs.existsSync(path.join(site, 'index.html'))) return site;
    } catch {
      // Not resolvable from here; try the next location.
    }
  }
  throw new ConfigError('cli/explorer-missing', 'The explorer is not installed: pnpm add -D @mariachi/explorer (it matches your @mariachi version)');
}

function openBrowser(url: string): void {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(command, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

export function registerExploreCommand(program: Command): void {
  program
    .command('explore')
    .description('Serve the Mariachi explorer (packages, docs, API, error codes, design library) for the installed version')
    .option('-p, --port <port>', 'port to listen on', '4321')
    .option('--host <host>', 'interface to bind', '127.0.0.1')
    .option('--open', 'open it in the browser')
    .action((opts: { port: string; host: string; open?: boolean }) => {
      try {
        const site = explorerSite(process.cwd());
        const server = createStaticServer(site);
        server.on('error', (error) => fail(error));
        server.listen(Number(opts.port), opts.host, () => {
          const url = `http://${opts.host === '0.0.0.0' ? 'localhost' : opts.host}:${opts.port}/`;
          console.log(`${GREEN}explorer${RESET} ${url}  ${DIM}(${site})${RESET}`);
          if (opts.open) openBrowser(url);
        });
      } catch (error) {
        fail(error);
      }
    });
}
