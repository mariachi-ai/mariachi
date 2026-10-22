let instance = 0;

/**
 * Gives every id in a snippet a per-instance suffix and rewrites the attributes that reference ids
 * (for, aria-*, popovertarget, list, form, href="#…") and radio `name`s to match, so the same
 * example can render several times on one page (component pages, compare view) without clashing.
 */
export function namespaceHtml(html: string, prefix = `x${++instance}`): string {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const names = new Set([...html.matchAll(/\sname="([^"]+)"/g)].map((m) => m[1]));
  const map = (v: string) => (ids.has(v) ? `${v}-${prefix}` : v);
  return html
    .replace(/\s(id|for|popovertarget|list|form|aria-controls|aria-labelledby|aria-describedby|aria-owns|data-m-dialog-open)="([^"]+)"/g, (_, attr: string, value: string) => ` ${attr}="${value.split(/\s+/).map(map).join(' ')}"`)
    .replace(/\shref="#([^"]+)"/g, (whole, value: string) => (ids.has(value) ? ` href="#${value}-${prefix}"` : whole))
    .replace(/\sdata-m-copy="#([^"]+)"/g, (whole, value: string) => (ids.has(value) ? ` data-m-copy="#${value}-${prefix}"` : whole))
    .replace(/\sname="([^"]+)"/g, (_, value: string) => (names.has(value) ? ` name="${value}-${prefix}"` : _));
}
