/** Top-level sections, in header order. `match` is the route prefix that marks a section active. */
export const SECTIONS = [
  { label: 'Packages', route: 'packages', match: 'packages' },
  { label: 'Docs', route: 'docs', match: 'docs' },
  { label: 'API', route: 'api', match: 'api' },
  { label: 'Reference', route: 'reference/errors', match: 'reference' },
  { label: 'Design', route: 'design', match: 'design' },
  { label: 'Status', route: 'status', match: 'status' },
] as const;

export interface SidebarLink {
  label: string;
  route: string;
  badge?: string;
}

export interface SidebarGroup {
  heading: string;
  links: SidebarLink[];
}

/** Route of the current page without the base, e.g. `packages/ai`. */
export function currentRoute(pathname: string, base: string): string {
  return pathname.slice(base.length).replace(/^\/+|\/+$/g, '');
}
