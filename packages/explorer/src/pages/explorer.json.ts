import type { APIRoute } from 'astro';
import { loadApi } from '../loaders/api';
import { loadCli } from '../loaders/cli';
import { loadDesign } from '../loaders/design';
import { loadDocs } from '../loaders/docs';
import { loadErrors } from '../loaders/errors';
import { loadGraph } from '../loaders/graph';
import { loadPackages } from '../loaders/packages';
import { loadTables } from '../loaders/tables';

/**
 * Everything the explorer knows, as one JSON document: packages, docs outlines, the API surface,
 * error codes, CLI commands, framework tables, the dependency graph and the design catalog. Coding
 * agents can fetch this instead of crawling pages.
 */
export const GET: APIRoute = async () => {
  const [packages, docs, api, { errors }, cli, tables, graph] = await Promise.all([
    loadPackages(),
    loadDocs(),
    loadApi(),
    loadErrors(),
    loadCli(),
    loadTables(),
    loadGraph(),
  ]);
  const design = loadDesign();
  const body = {
    $schema: 'mariachi-explorer/1',
    version: design.version,
    packages: packages.map(({ readme, ...p }) => ({ ...p, hasReadme: readme !== null })),
    docs: docs.map(({ html, ...d }) => d),
    api,
    errors,
    cli,
    tables,
    graph: { nodes: graph.nodes, edges: graph.edges },
    design: {
      presets: design.presets.map(({ tokens, ...p }) => p),
      semanticTokens: design.semantic,
      components: design.components.map(({ examples, ...c }) => ({ ...c, examples: examples.map((e) => ({ name: e.name, html: e.html })) })),
    },
  };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
};
