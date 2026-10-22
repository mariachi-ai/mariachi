/**
 * Zod schemas for every loader's output. Loaders validate before returning, so a page never
 * renders data of the wrong shape and a broken source fails the build with the offending path.
 */
import { z } from 'zod';
import { ExplorerError } from '../lib/errors';

export const heading = z.object({ depth: z.number().int().min(1).max(6), id: z.string(), text: z.string() });
export type Heading = z.infer<typeof heading>;

export const docEntry = z.object({
  /** Route under /docs/ (e.g. `recipes/add-background-job`). */
  slug: z.string(),
  title: z.string().min(1),
  /** Repo-relative source file. */
  file: z.string(),
  section: z.enum(['start', 'guide', 'recipe', 'adr', 'project']),
  summary: z.string(),
  html: z.string(),
  headings: z.array(heading),
});
export type DocEntry = z.infer<typeof docEntry>;

export const packageEntry = z.object({
  name: z.string().startsWith('@mariachi/'),
  /** Folder under packages/ and the route under /packages/. */
  slug: z.string(),
  version: z.string(),
  description: z.string(),
  category: z.string(),
  categoryTitle: z.string(),
  status: z.enum(['beta', 'alpha']),
  useWhen: z.string(),
  entry: z.array(z.string()),
  install: z.string(),
  subpaths: z.array(z.object({ subpath: z.string(), kind: z.enum(['code', 'asset']) })),
  dependencies: z.array(z.string()),
  peers: z.array(z.object({ name: z.string(), range: z.string(), optional: z.boolean(), internal: z.boolean() })),
  usedBy: z.array(z.string()),
  readme: z.object({ html: z.string(), headings: z.array(heading) }).nullable(),
  relatedDocs: z.array(z.object({ slug: z.string(), title: z.string() })),
  sourceUrl: z.string(),
});
export type PackageEntry = z.infer<typeof packageEntry>;

export const apiMember = z.object({
  name: z.string(),
  kind: z.string(),
  signature: z.string(),
  summary: z.string(),
});
export type ApiMember = z.infer<typeof apiMember>;

export const apiSymbol = z.object({
  name: z.string(),
  kind: z.enum(['function', 'class', 'interface', 'type', 'variable', 'enum', 'namespace']),
  signature: z.string(),
  summary: z.string(),
  tags: z.array(z.object({ name: z.string(), text: z.string() })),
  deprecated: z.string().nullable(),
  members: z.array(apiMember),
});
export type ApiSymbol = z.infer<typeof apiSymbol>;

export const apiPackage = z.object({
  package: z.string(),
  slug: z.string(),
  entries: z.array(z.object({ subpath: z.string(), importPath: z.string(), symbols: z.array(apiSymbol) })),
});
export type ApiPackage = z.infer<typeof apiPackage>;

export const errorEntry = z.object({
  /** The stable code, or a pattern with `*` where the code is built from a template. */
  code: z.string().min(1),
  className: z.string(),
  package: z.string(),
  file: z.string(),
  line: z.number().int().positive(),
  message: z.string(),
  http: z.number().int().nullable(),
});
export type ErrorEntry = z.infer<typeof errorEntry>;

export interface CliCommand {
  name: string;
  path: string;
  aliases: string[];
  description: string;
  usage: string;
  arguments: { name: string; required: boolean; variadic: boolean; description: string }[];
  options: { flags: string; description: string; defaultValue: string | null }[];
  subcommands: CliCommand[];
}
export const cliCommand: z.ZodType<CliCommand> = z.lazy(() =>
  z.object({
    name: z.string(),
    path: z.string(),
    aliases: z.array(z.string()),
    description: z.string(),
    usage: z.string(),
    arguments: z.array(z.object({ name: z.string(), required: z.boolean(), variadic: z.boolean(), description: z.string() })),
    options: z.array(z.object({ flags: z.string(), description: z.string(), defaultValue: z.string().nullable() })),
    subcommands: z.array(cliCommand),
  }),
);

export const tableEntry = z.object({
  exportName: z.string(),
  tableName: z.string(),
  package: z.string(),
  columns: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      type: z.string(),
      notNull: z.boolean(),
      unique: z.boolean(),
      primaryKey: z.boolean(),
      default: z.string().nullable(),
      references: z.string().nullable(),
    }),
  ),
  indexes: z.array(z.object({ name: z.string(), columns: z.array(z.string()), unique: z.boolean() })),
  primaryKey: z.array(z.string()),
  tenantColumn: z.string().nullable(),
  softDeleteColumn: z.string().nullable(),
});
export type TableEntry = z.infer<typeof tableEntry>;

export const graph = z.object({
  nodes: z.array(z.object({ id: z.string(), slug: z.string(), category: z.string(), status: z.string() })),
  edges: z.array(z.object({ from: z.string(), to: z.string(), kind: z.enum(['dependency', 'peer']) })),
  mermaid: z.string(),
});
export type Graph = z.infer<typeof graph>;

/** Parses with a schema and throws a readable error naming the source. */
export function validate<T>(schema: z.ZodType<T>, value: unknown, source: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new ExplorerError('explorer/invalid-data', `Invalid data from ${source}:\n${issues}`, { source });
  }
  return result.data;
}
