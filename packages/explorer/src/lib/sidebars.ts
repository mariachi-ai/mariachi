import type { Catalog } from '@mariachi/design/build';
import type { ApiPackage, DocEntry, PackageEntry } from '../data/schema';
import type { SidebarGroup } from './nav';

export function packagesSidebar(packages: PackageEntry[], categories: Record<string, string>): SidebarGroup[] {
  return [
    { heading: 'Overview', links: [{ label: 'All packages', route: 'packages' }, { label: 'Dependency graph', route: 'reference/graph' }] },
    ...Object.entries(categories)
      .map(([key, title]) => ({
        heading: title,
        links: packages
          .filter((p) => p.category === key)
          .map((p) => ({ label: p.name.replace('@mariachi/', ''), route: `packages/${p.slug}`, badge: p.status === 'alpha' ? 'alpha' : undefined })),
      }))
      .filter((g) => g.links.length > 0),
  ];
}

const DOC_SECTIONS: [DocEntry['section'], string][] = [
  ['start', 'Start here'],
  ['guide', 'Guides'],
  ['recipe', 'Recipes'],
  ['adr', 'Decisions'],
];

export function docsSidebar(docs: DocEntry[]): SidebarGroup[] {
  return DOC_SECTIONS.map(([section, heading]) => ({
    heading,
    links: docs
      .filter((d) => d.section === section)
      .map((d) => ({ label: d.slug === '' ? 'Overview' : d.title, route: d.slug === '' ? 'docs' : `docs/${d.slug}` })),
  })).filter((g) => g.links.length > 0);
}

export function apiSidebar(api: ApiPackage[], packages: PackageEntry[], categories: Record<string, string>): SidebarGroup[] {
  const count = (slug: string) => api.find((a) => a.slug === slug)?.entries.reduce((n, e) => n + e.symbols.length, 0) ?? 0;
  return [
    { heading: 'API', links: [{ label: 'All packages', route: 'api' }] },
    ...Object.entries(categories)
      .map(([key, title]) => ({
        heading: title,
        links: packages
          .filter((p) => p.category === key && count(p.slug) > 0)
          .map((p) => ({ label: p.name.replace('@mariachi/', ''), route: `api/${p.slug}`, badge: String(count(p.slug)) })),
      }))
      .filter((g) => g.links.length > 0),
  ];
}

export const referenceSidebar: SidebarGroup[] = [
  {
    heading: 'Reference',
    links: [
      { label: 'Error codes', route: 'reference/errors' },
      { label: 'CLI commands', route: 'reference/cli' },
      { label: 'Framework tables', route: 'reference/tables' },
      { label: 'Dependency graph', route: 'reference/graph' },
    ],
  },
];

const CATEGORY_TITLES: Record<string, string> = {
  layout: 'Layout',
  actions: 'Actions',
  forms: 'Forms',
  data: 'Data display',
  navigation: 'Navigation',
  feedback: 'Feedback',
  overlays: 'Overlays',
  content: 'Content',
  ai: 'AI patterns',
};

export const componentCategoryTitle = (key: string) => CATEGORY_TITLES[key] ?? key;

export function designSidebar(catalog: Catalog): SidebarGroup[] {
  const categories = [...new Set(catalog.components.map((c) => c.category))];
  return [
    {
      heading: 'Design',
      links: [
        { label: 'Overview', route: 'design' },
        { label: 'Compare presets', route: 'design/compare' },
        { label: 'Playground', route: 'design/playground' },
        { label: 'Sample pages', route: 'design/samples' },
      ],
    },
    { heading: 'Presets', links: catalog.presets.map((p) => ({ label: p.label, route: `design/presets/${p.name}` })) },
    ...categories.map((cat) => ({
      heading: componentCategoryTitle(cat),
      links: catalog.components.filter((c) => c.category === cat).map((c) => ({ label: c.title, route: `design/components/${c.name}` })),
    })),
  ];
}
