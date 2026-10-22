import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { type PackageEntry, packageEntry, validate } from '../data/schema';
import { ExplorerError } from '../lib/errors';
import { renderMarkdown } from '../lib/markdown';
import { fromRoot, GITHUB, once } from '../lib/repo';
import { docSources } from './docs';
import { routeForFile } from './routes';

interface RawPackage {
  dir: string;
  name: string;
  version: string;
  description: string;
  hasReadme: boolean;
  category: string;
  status: 'beta' | 'alpha';
  useWhen: string;
  entry?: string[];
  pkg: {
    exports?: Record<string, unknown>;
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  };
}

interface PackagesModule {
  CATEGORIES: Record<string, string>;
  readPackages(root: string): { packages: RawPackage[]; errors: string[] };
}

/** The same metadata reader as `scripts/generate-catalog.mjs`, so the catalog and the explorer agree. */
export const readRawPackages = once(async () => {
  const mod = (await import(/* @vite-ignore */ pathToFileURL(fromRoot('scripts/lib/packages.mjs')).href)) as PackagesModule;
  const { packages, errors } = mod.readPackages(fromRoot());
  if (errors.length > 0) throw new ExplorerError('explorer/invalid-data', `Package metadata:\n${errors.join('\n')}`, { errors });
  return { packages, categories: mod.CATEGORIES };
});

function subpaths(exports: Record<string, unknown> | undefined): PackageEntry['subpaths'] {
  return Object.entries(exports ?? {})
    .filter(([key]) => key !== './package.json')
    .map(([key, value]) => ({
      subpath: key === '.' ? '' : key.slice(1),
      kind: typeof value === 'string' && !/\.(c|m)?js$/.test(value) ? ('asset' as const) : ('code' as const),
    }));
}

export const loadPackages = once(async (): Promise<PackageEntry[]> => {
  const { packages, categories } = await readRawPackages();
  const docs = docSources();
  const internal = (deps: Record<string, string> | undefined) => Object.keys(deps ?? {}).filter((d) => d.startsWith('@mariachi/'));
  const entries = await Promise.all(
    packages.map(async (p) => {
      const readmeFile = fromRoot('packages', p.dir, 'README.md');
      const readme = p.hasReadme ? await renderMarkdown(fs.readFileSync(readmeFile, 'utf8'), readmeFile, routeForFile) : null;
      const peers = Object.entries(p.pkg.peerDependencies ?? {}).map(([name, range]) => ({
        name,
        range,
        optional: p.pkg.peerDependenciesMeta?.[name]?.optional === true,
        internal: name.startsWith('@mariachi/'),
      }));
      const usedBy = packages
        .filter((o) => o.name !== p.name && [...internal(o.pkg.dependencies), ...internal(o.pkg.peerDependencies)].includes(p.name))
        .map((o) => o.name)
        .sort();
      const relatedDocs = docs
        .filter((d) => d.markdown.includes(`\`${p.name}\``) || d.markdown.includes(`${p.name}/`) || d.markdown.includes(`/${p.dir}/README.md`))
        .map((d) => ({ slug: d.slug, title: /^#\s+(.+)$/m.exec(d.markdown)?.[1]?.trim() ?? d.slug }));
      return validate(
        packageEntry,
        {
          name: p.name,
          slug: p.dir,
          version: p.version,
          description: p.description,
          category: p.category,
          categoryTitle: categories[p.category] ?? p.category,
          status: p.status,
          useWhen: p.useWhen,
          entry: p.entry ?? [],
          install: `pnpm add ${p.name}`,
          subpaths: subpaths(p.pkg.exports),
          dependencies: internal(p.pkg.dependencies).sort(),
          peers,
          usedBy,
          readme: readme ? { html: readme.html, headings: readme.headings } : null,
          relatedDocs,
          sourceUrl: `${GITHUB}/tree/main/packages/${p.dir}`,
        },
        `packages/${p.dir}/package.json`,
      );
    }),
  );
  return entries.sort((a, b) => a.name.localeCompare(b.name));
});

export const loadCategories = once(async () => (await readRawPackages()).categories);
