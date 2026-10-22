import { type Graph, graph, validate } from '../data/schema';
import { once } from '../lib/repo';
import { loadCategories, loadPackages } from './packages';

const nodeId = (name: string) => name.replace('@mariachi/', '').replace(/[^a-z0-9]/g, '_');

/** Internal dependency graph (dependencies and peers on other @mariachi packages), plus Mermaid source. */
export const loadGraph = once(async (): Promise<Graph> => {
  const packages = await loadPackages();
  const categories = await loadCategories();
  const names = new Set(packages.map((p) => p.name));
  const edges: Graph['edges'] = packages.flatMap((p) => [
    ...p.dependencies.filter((d) => names.has(d)).map((to) => ({ from: p.name, to, kind: 'dependency' as const })),
    ...p.peers.filter((d) => d.internal && names.has(d.name) && !p.dependencies.includes(d.name)).map((d) => ({ from: p.name, to: d.name, kind: 'peer' as const })),
  ]);
  const lines = ['flowchart LR'];
  for (const [key, title] of Object.entries(categories)) {
    const group = packages.filter((p) => p.category === key);
    if (group.length === 0) continue;
    lines.push(`  subgraph ${key}["${title}"]`);
    for (const p of group) lines.push(`    ${nodeId(p.name)}["${p.name.replace('@mariachi/', '')}"]`);
    lines.push('  end');
  }
  for (const e of edges) lines.push(`  ${nodeId(e.from)} ${e.kind === 'peer' ? '-.->' : '-->'} ${nodeId(e.to)}`);
  return validate(
    graph,
    {
      nodes: packages.map((p) => ({ id: p.name, slug: p.slug, category: p.category, status: p.status })),
      edges,
      mermaid: lines.join('\n'),
    },
    'package graph',
  );
});
