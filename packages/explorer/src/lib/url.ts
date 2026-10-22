/** The site's base path ('/' locally and in the package, '/<repo>/' on GitHub Pages). */
export const BASE = (import.meta.env?.BASE_URL ?? '/').replace(/\/?$/, '/');

/** Absolute URL for an explorer route: `href('packages/ai')` → `/packages/ai/` (with the base). */
export function href(route: string): string {
  const clean = route.replace(/^\/+/, '');
  if (clean === '') return BASE;
  const [pathPart, hash] = clean.split('#');
  const withSlash = /\.[a-z0-9]+$/i.test(pathPart) || pathPart.endsWith('/') ? pathPart : `${pathPart}/`;
  return `${BASE}${withSlash}${hash ? `#${hash}` : ''}`;
}
