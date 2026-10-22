import fs from 'node:fs';
import type { APIRoute } from 'astro';
import { fromRoot } from '../../../lib/repo';
import { loadDesign } from '../../../loaders/design';

export function getStaticPaths() {
  return loadDesign().presets.map((p) => ({ params: { name: p.name } }));
}

/** A preset's DTCG token file, as published in @mariachi/design/tokens/<name>.json. */
export const GET: APIRoute = ({ params }) =>
  new Response(fs.readFileSync(fromRoot('packages', 'design', 'dist', 'tokens', `${params.name}.json`), 'utf8'), {
    headers: { 'Content-Type': 'application/json' },
  });
