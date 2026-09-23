import { posix } from 'node:path';
import type { Violation } from '../types';

export interface SourceFile {
  /** Project-relative, forward slashes. */
  path: string;
  content: string;
  lines: string[];
  imports: Array<{ spec: string; line: number }>;
}

export interface Rule {
  name: string;
  description: string;
  check(files: SourceFile[], paths: Set<string>): Violation[];
}

const isTest = (p: string) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(p) || /(^|\/)(?:__tests__|test|tests)\//.test(p);
const segments = (p: string) => p.split('/');

export const isController = (p: string) => /\.controller\.[cm]?[jt]sx?$/.test(p) || segments(p).slice(0, -1).includes('controllers');
export const isFacade = (p: string) => segments(p).slice(0, -1).includes('servers') || p.includes('facade/');
export const isServiceLayer = (p: string) =>
  /\.(?:service|repository|handler|handlers)\.[cm]?[jt]sx?$/.test(p) || segments(p).slice(0, -1).includes('services');

const DB_PACKAGES = /^(?:@mariachi\/database(?:-postgres)?|drizzle-orm|postgres|pg|mysql2|better-sqlite3)(?:\/|$)/;
const HTTP_PACKAGES = /^(?:fastify|express|hono|koa|@fastify\/[^/]+|@mariachi\/(?:server|api-facade|webhooks))(?:\/|$)/;

function resolveRelative(from: string, spec: string): string | undefined {
  if (!spec.startsWith('.')) return undefined;
  return posix.normalize(posix.join(posix.dirname(from), spec));
}

function forbiddenImports(
  name: string,
  applies: (p: string) => boolean,
  forbidden: (spec: string, resolved: string | undefined) => boolean,
  message: (spec: string) => string,
  suggestion: string,
): Rule['check'] {
  return (files) =>
    files
      .filter((f) => applies(f.path) && !isTest(f.path))
      .flatMap((f) =>
        f.imports
          .filter((i) => forbidden(i.spec, resolveRelative(f.path, i.spec)))
          .map((i) => ({ rule: name, severity: 'error' as const, file: f.path, line: i.line, message: message(i.spec), suggestion })),
      );
}

function matchLines(file: SourceFile, pattern: RegExp): Array<{ line: number; match: RegExpMatchArray }> {
  const out: Array<{ line: number; match: RegExpMatchArray }> = [];
  file.lines.forEach((text, i) => {
    const trimmed = text.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    const match = text.match(pattern);
    if (match) out.push({ line: i + 1, match });
  });
  return out;
}

function sibling(paths: Set<string>, file: string, from: RegExp, ...suffixes: string[]): boolean {
  return suffixes.some((s) => paths.has(file.replace(from, s)));
}

const CONFIG_FILE = (p: string) =>
  p.includes('packages/config/') ||
  /(^|\/)src\/config(?:\.[cm]?[jt]s|\/)/.test(p) ||
  /^[^/]+\.config\.[cm]?[jt]s$/.test(p) ||
  p.startsWith('scripts/');

const EVENT_NAME = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

export const RULES: Rule[] = [
  {
    name: 'no-service-import-in-controller',
    description: 'Controllers reach services only through communication.call()',
    check: forbiddenImports(
      'no-service-import-in-controller',
      isController,
      (spec, resolved) => (resolved ? isServiceLayer(resolved) : /(^|\/)services(\/|$)/.test(spec)),
      (spec) => `Controller imports service-layer module "${spec}"`,
      'Call a procedure with this.call(ctx, "<domain>.<action>", input); share schemas via src/contracts/',
    ),
  },
  {
    name: 'no-db-in-controller',
    description: 'Controllers do not touch the database',
    check: forbiddenImports(
      'no-db-in-controller',
      isController,
      (spec) => DB_PACKAGES.test(spec),
      (spec) => `Controller imports database module "${spec}"`,
      'Move data access into a service and expose it as a procedure',
    ),
  },
  {
    name: 'no-db-in-facade',
    description: 'Server/facade files do not touch the database',
    check: forbiddenImports(
      'no-db-in-facade',
      (p) => isFacade(p) && !isController(p),
      (spec) => DB_PACKAGES.test(spec),
      (spec) => `Facade imports database module "${spec}"`,
      'Move data access into a service',
    ),
  },
  {
    name: 'no-http-in-service',
    description: 'Services are transport-agnostic',
    check: forbiddenImports(
      'no-http-in-service',
      (p) => isServiceLayer(p) && !isController(p),
      (spec) => HTTP_PACKAGES.test(spec),
      (spec) => `Service imports HTTP module "${spec}"`,
      'Keep HTTP concerns in controllers; services take (ctx, input)',
    ),
  },
  {
    name: 'extensionless-imports',
    description: "Relative imports have no file extension (moduleResolution 'bundler')",
    check: (files) =>
      files.flatMap((f) =>
        f.imports
          .filter((i) => i.spec.startsWith('.') && /\.(?:[cm]?js|[cm]?ts|tsx|jsx)$/.test(i.spec))
          .map((i) => ({
            rule: 'extensionless-imports',
            severity: 'error' as const,
            file: f.path,
            line: i.line,
            message: `Relative import "${i.spec}" has an extension`,
            suggestion: `Use '${i.spec.replace(/\.(?:[cm]?js|[cm]?ts|tsx|jsx)$/, '')}'`,
          })),
      ),
  },
  {
    name: 'no-deep-imports',
    description: 'Import @mariachi packages by their public entry points',
    check: (files) =>
      files.flatMap((f) =>
        f.imports
          .filter((i) => /^@mariachi\/[^/]+\/(?:src|dist)(?:\/|$)/.test(i.spec))
          .map((i) => ({
            rule: 'no-deep-imports',
            severity: 'error' as const,
            file: f.path,
            line: i.line,
            message: `"${i.spec}" reaches into a package's internals`,
            suggestion: 'Import from the package root or a documented subpath export',
          })),
      ),
  },
  {
    name: 'no-process-env',
    description: 'Environment is read through @mariachi/config',
    check: (files) =>
      files
        .filter((f) => !CONFIG_FILE(f.path) && !isTest(f.path))
        .flatMap((f) =>
          matchLines(f, /\bprocess\.env\b/).map(({ line }) => ({
            rule: 'no-process-env',
            severity: 'error' as const,
            file: f.path,
            line,
            message: 'process.env used outside configuration',
            suggestion: 'Use loadConfig()/useConfig() or readEnv() from @mariachi/config',
          })),
        ),
  },
  {
    name: 'no-raw-error',
    description: 'Throw MariachiError subclasses so errors carry a code and HTTP status',
    check: (files) =>
      files
        .filter((f) => !isTest(f.path))
        .flatMap((f) =>
          matchLines(f, /\bthrow\s+new\s+(Error|TypeError|RangeError)\s*\(/).map(({ line, match }) => ({
            rule: 'no-raw-error',
            severity: 'error' as const,
            file: f.path,
            line,
            message: `throw new ${match[1]}(...)`,
            suggestion: 'Throw a typed error from @mariachi/core (ValidationError, NotFoundError, ConflictError, ...)',
          })),
        ),
  },
  {
    name: 'handler-for-every-service',
    description: 'Each *.service.ts has a sibling *.handler.ts registering its procedures',
    check: (files, paths) =>
      files
        .filter((f) => /\.service\.[cm]?[jt]s$/.test(f.path) && !isTest(f.path))
        .filter((f) => !sibling(paths, f.path, /\.service\.([cm]?[jt]s)$/, '.handler.$1', '.handlers.$1'))
        .map((f) => ({
          rule: 'handler-for-every-service',
          severity: 'warning' as const,
          file: f.path,
          message: 'Service has no handler file, so it is not reachable through communication',
          suggestion: `Create ${f.path.replace(/\.service\./, '.handler.')} (or ignore if the service is internal)`,
        })),
  },
  {
    name: 'test-for-every-service',
    description: 'Each *.service.ts has a test',
    check: (files, paths) =>
      files
        .filter((f) => /\.service\.[cm]?[jt]s$/.test(f.path) && !isTest(f.path))
        .filter((f) => {
          const base = posix.basename(f.path).replace(/\.service\.[cm]?[jt]s$/, '');
          const dir = posix.dirname(f.path);
          return ![
            `${dir}/${base}.service.test.ts`,
            `${dir}/${base}.test.ts`,
            `${dir}/test/${base}.service.test.ts`,
            `${dir}/__tests__/${base}.service.test.ts`,
          ].some((p) => paths.has(p));
        })
        .map((f) => ({
          rule: 'test-for-every-service',
          severity: 'warning' as const,
          file: f.path,
          message: 'Service has no test',
          suggestion: `Create ${f.path.replace(/\.service\.[cm]?[jt]s$/, '.service.test.ts')}`,
        })),
  },
  {
    name: 'unique-procedure-names',
    description: 'A procedure name is registered once',
    check: (files) => {
      const seen = new Map<string, { file: string; line: number }>();
      const out: Violation[] = [];
      for (const f of files.filter((x) => !isTest(x.path))) {
        for (const m of f.content.matchAll(/\.register\(\s*['"]([a-zA-Z][\w-]*\.[\w.-]+)['"]/g)) {
          const line = f.content.slice(0, m.index).split('\n').length;
          const prev = seen.get(m[1]);
          if (prev) {
            out.push({
              rule: 'unique-procedure-names',
              severity: 'error',
              file: f.path,
              line,
              message: `Procedure "${m[1]}" is also registered at ${prev.file}:${prev.line}`,
              suggestion: 'Rename one of them; duplicate registrations throw at startup',
            });
          } else {
            seen.set(m[1], { file: f.path, line });
          }
        }
      }
      return out;
    },
  },
  {
    name: 'event-name-format',
    description: 'Event names are lowercase and dot-separated (domain.entity.verb)',
    check: (files) =>
      files.flatMap((f) =>
        [...f.content.matchAll(/(?:defineEvent\(\s*|\.publish\(\s*[\w.]+\s*,\s*)['"`]([^'"`]+)['"`]/g)]
          .filter((m) => !EVENT_NAME.test(m[1]))
          .map((m) => ({
            rule: 'event-name-format',
            severity: 'warning' as const,
            file: f.path,
            line: f.content.slice(0, m.index).split('\n').length,
            message: `Event name "${m[1]}" is not lowercase dot-separated`,
            suggestion: 'Use a name like billing.invoice.paid',
          })),
      ),
  },
];
