import fs from 'node:fs';
import path from 'node:path';
import { type DocEntry, docEntry, validate } from '../data/schema';
import { renderMarkdown } from '../lib/markdown';
import { fromRoot, once, relative } from '../lib/repo';
import { routeForFile } from './routes';

export interface DocSource {
  file: string;
  slug: string;
  markdown: string;
}

const START = new Set(['README', 'architecture', 'conventions', 'patterns', 'ai-guide']);

/** Every markdown file under packages/core/docs except the generated catalog (that's the /packages/ page). */
export function docSources(): DocSource[] {
  const dir = fromRoot('packages/core/docs');
  const walk = (d: string): string[] =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.md') ? [path.join(d, e.name)] : []));
  return walk(dir)
    .filter((f) => !f.endsWith('/packages.md'))
    .map((file) => ({ file, slug: routeForFile(file)!.replace(/^docs\/?/, ''), markdown: fs.readFileSync(file, 'utf8') }));
}

function section(slug: string): DocEntry['section'] {
  if (slug.startsWith('recipes/')) return 'recipe';
  if (slug.startsWith('adr/')) return 'adr';
  if (slug === '' || START.has(slug)) return 'start';
  return 'guide';
}

/** Order of links in the docs README (the hand-curated reading order); unlinked docs go last. */
function readingOrder(sources: DocSource[]): Map<string, number> {
  const readme = sources.find((s) => s.slug === '');
  const order = new Map<string, number>([['', 0]]);
  for (const m of readme?.markdown.matchAll(/\]\(\.\/([^)#]+)\.md\)/g) ?? []) if (!order.has(m[1])) order.set(m[1], order.size);
  return order;
}

export const loadDocs = once(async (): Promise<DocEntry[]> => {
  const sources = docSources();
  const order = readingOrder(sources);
  const entries = await Promise.all(
    sources.map(async (s) => {
      const rendered = await renderMarkdown(s.markdown, s.file, routeForFile);
      return validate(
        docEntry,
        {
          slug: s.slug,
          title: rendered.title ?? s.slug,
          file: relative(s.file),
          section: section(s.slug),
          summary: rendered.summary,
          html: rendered.html,
          headings: rendered.headings,
        },
        relative(s.file),
      );
    }),
  );
  const rank = (d: DocEntry) => order.get(d.slug) ?? 1000;
  return entries.sort((a, b) => rank(a) - rank(b) || a.slug.localeCompare(b.slug));
});
