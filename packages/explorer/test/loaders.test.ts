/**
 * Loaders run against the real repo (packages must be built: turbo builds them first) plus small
 * fixtures for the edge cases.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ExplorerError } from '../src/lib/errors';
import { renderMarkdown } from '../src/lib/markdown';
import { fromRoot } from '../src/lib/repo';
import { href } from '../src/lib/url';
import { loadApi } from '../src/loaders/api';
import { loadCli } from '../src/loaders/cli';
import { loadDocs } from '../src/loaders/docs';
import { loadErrors, scanErrors } from '../src/loaders/errors';
import { loadGraph } from '../src/loaders/graph';
import { loadPackages } from '../src/loaders/packages';
import { routeForFile } from '../src/loaders/routes';
import { loadTables } from '../src/loaders/tables';

describe('routes', () => {
  it('maps docs, the catalog, the roadmap and package READMEs', () => {
    expect(routeForFile(fromRoot('packages/core/docs/README.md'))).toBe('docs');
    expect(routeForFile(fromRoot('packages/core/docs/architecture.md'))).toBe('docs/architecture');
    expect(routeForFile(fromRoot('packages/core/docs/recipes/add-background-job.md'))).toBe('docs/recipes/add-background-job');
    expect(routeForFile(fromRoot('packages/core/docs/packages.md'))).toBe('packages');
    expect(routeForFile(fromRoot('ROADMAP.md'))).toBe('status');
    expect(routeForFile(fromRoot('packages/ai/README.md'))).toBe('packages/ai');
    expect(routeForFile(fromRoot('packages/ai'))).toBe('packages/ai');
    expect(routeForFile(fromRoot('packages/ai/src/ai.ts'))).toBeUndefined();
  });

  it('adds a trailing slash and keeps hashes', () => {
    expect(href('packages/ai')).toBe('/packages/ai/');
    expect(href('docs/http#routes')).toBe('/docs/http/#routes');
    expect(href('')).toBe('/');
    expect(href('explorer.json')).toBe('/explorer.json');
  });
});

describe('renderMarkdown', () => {
  const source = fromRoot('packages/core/docs/fixture.md');

  it('rewrites links, takes the title, renders Mermaid and highlights code', async () => {
    const md = [
      '# Title here',
      '',
      'Intro paragraph with [arch](./architecture.md#layers), [ai](../../ai/README.md) and [src](../../ai/src/ai.ts).',
      '',
      '## Section',
      '',
      '```mermaid\nflowchart LR\n  A --> B\n```',
      '',
      '```ts\nconst x = 1;\n```',
      '',
      '| a | b |\n| - | - |\n| 1 | 2 |',
    ].join('\n');
    const out = await renderMarkdown(md, source, routeForFile);
    expect(out.title).toBe('Title here');
    expect(out.summary).toMatch(/^Intro paragraph/);
    expect(out.html).not.toContain('<h1');
    expect(out.html).toContain('href="/docs/architecture/#layers"');
    expect(out.html).toContain('href="/packages/ai/"');
    expect(out.html).toContain('href="https://github.com/mariachi-ai/mariachi/blob/main/packages/ai/src/ai.ts"');
    expect(out.html).toContain('<pre class="mermaid">flowchart LR\n  A --&gt; B</pre>');
    expect(out.html).toMatch(/<pre class="shiki mariachi m-code"/);
    expect(out.html).toContain('<div class="m-table-wrap" tabindex="0" role="region" aria-label="Table"><table>');
    expect(out.headings).toEqual([{ depth: 2, id: 'section', text: 'Section' }]);
  });

  it('fails on a link to a file that does not exist', async () => {
    await expect(renderMarkdown('[x](./nope.md)', source, routeForFile)).rejects.toThrow(ExplorerError);
  });
});

describe('packages', () => {
  it('agrees with the catalog script', async () => {
    const { readPackages } = await import(pathToFileURL(fromRoot('scripts/lib/packages.mjs')).href);
    const raw = readPackages(fromRoot()).packages as { name: string; status: string; category: string }[];
    const entries = await loadPackages();
    expect(entries.map((p) => [p.name, p.status, p.category])).toEqual(
      raw.map((p) => [p.name, p.status, p.category]).sort((a, b) => a[0].localeCompare(b[0])),
    );
  });

  it('computes used-by as the inverse of dependencies', async () => {
    const entries = await loadPackages();
    const core = entries.find((p) => p.name === '@mariachi/core')!;
    const ai = entries.find((p) => p.name === '@mariachi/ai')!;
    expect(ai.dependencies).toContain('@mariachi/core');
    expect(core.usedBy).toContain('@mariachi/ai');
    expect(ai.peers.find((p) => p.name === '@ai-sdk/anthropic')).toMatchObject({ optional: true, internal: false });
    expect(ai.subpaths.map((s) => s.subpath)).toContain('/anthropic');
  });
});

describe('docs', () => {
  it('renders every doc with resolvable links, in reading order', async () => {
    const docs = await loadDocs();
    const slugs = docs.map((d) => d.slug);
    expect(slugs[0]).toBe('');
    expect(slugs).toContain('architecture');
    expect(slugs).toContain('recipes/add-background-job');
    expect(slugs).not.toContain('packages');
    expect(slugs.indexOf('architecture')).toBeLessThan(slugs.indexOf('http'));
  });
});

describe('errors', () => {
  it('indexes literal and template codes through subclass chains, and reports dynamic ones', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'explorer-errors-'));
    const file = path.join(dir, 'x.ts');
    fs.writeFileSync(
      file,
      [
        'class FooError extends MariachiError {}',
        'class BarError extends FooError {}',
        "class FixedError extends MariachiError { constructor(m: string) { super('fixed/code', m); } }",
        "throw new BarError('foo/bad', 'Bad thing');",
        'throw new FooError(`foo/${kind}`, `Saw ${kind}`);',
        "throw new FixedError('Always fixed');",
        "throw new FooError(code, 'dynamic');",
        "throw new Error('not ours');",
      ].join('\n'),
    );
    const { errors, dynamic } = scanErrors([{ file, packageName: '@mariachi/x' }]);
    expect(errors.map((e) => [e.code, e.className, e.message])).toEqual([
      ['fixed/code', 'FixedError', 'Always fixed'],
      ['foo/*', 'FooError', 'Saw {kind}'],
      ['foo/bad', 'BarError', 'Bad thing'],
    ]);
    expect(dynamic).toHaveLength(1);
  });

  it('finds real codes with their HTTP status', async () => {
    const { errors } = await loadErrors();
    const config = errors.find((e) => e.code === 'ai/config');
    expect(config).toMatchObject({ package: '@mariachi/ai', className: 'AIError' });
    expect(errors.find((e) => e.code === 'auth/unauthorized')?.http).toBe(401);
    expect(errors.some((e) => e.className === 'DesignError')).toBe(true);
  });
});

describe('api', () => {
  it('reads exported symbols, signatures and JSDoc from built declarations', async () => {
    const api = await loadApi();
    const core = api.find((p) => p.package === '@mariachi/core')!;
    const root = core.entries.find((e) => e.subpath === '')!;
    const retry = root.symbols.find((s) => s.name === 'retry');
    expect(retry?.kind).toBe('function');
    expect(retry?.signature).toMatch(/^function retry/);
    const error = root.symbols.find((s) => s.name === 'MariachiError')!;
    expect(error.kind).toBe('class');
    expect(error.members.map((m) => m.name)).toContain('code');
    expect(core.entries.map((e) => e.importPath)).toContain('@mariachi/core/errors');
  });
});

describe('cli', () => {
  it('reads the command tree from the CLI definitions', async () => {
    const cli = await loadCli();
    expect(cli.subcommands.map((c) => c.name)).toEqual(expect.arrayContaining(['init', 'generate', 'validate', 'db']));
    const db = cli.subcommands.find((c) => c.name === 'db')!;
    expect(db.subcommands.length).toBeGreaterThan(0);
    expect(cli.subcommands.find((c) => c.name === 'validate')!.options.map((o) => o.flags)).toContain('--strict');
  });
});

describe('tables and graph', () => {
  it('lists framework tables with their owning package', async () => {
    const tables = await loadTables();
    const users = tables.find((t) => t.exportName === 'usersTable')!;
    expect(users.package).toBe('@mariachi/database');
    expect(users.columns.some((c) => c.primaryKey)).toBe(true);
  });

  it('builds the dependency graph', async () => {
    const graph = await loadGraph();
    expect(graph.edges).toContainEqual({ from: '@mariachi/ai', to: '@mariachi/core', kind: 'dependency' });
    expect(graph.mermaid.startsWith('flowchart LR')).toBe(true);
  });
});
