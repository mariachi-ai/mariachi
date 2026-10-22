import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { type ApiMember, type ApiPackage, type ApiSymbol, apiPackage, validate } from '../data/schema';
import { ExplorerError } from '../lib/errors';
import { fromRoot, once } from '../lib/repo';
import { readRawPackages } from './packages';

const KIND_ORDER: ApiSymbol['kind'][] = ['function', 'class', 'variable', 'interface', 'type', 'enum', 'namespace'];
const MAX_LINES = 40;

function kindOf(decl: ts.Declaration): ApiSymbol['kind'] | undefined {
  if (ts.isFunctionDeclaration(decl)) return 'function';
  if (ts.isClassDeclaration(decl)) return 'class';
  if (ts.isInterfaceDeclaration(decl)) return 'interface';
  if (ts.isTypeAliasDeclaration(decl)) return 'type';
  if (ts.isVariableDeclaration(decl)) return 'variable';
  if (ts.isEnumDeclaration(decl)) return 'enum';
  if (ts.isModuleDeclaration(decl)) return 'namespace';
  return undefined;
}

/** Declaration text without `export`/`declare`, JSDoc blocks, or bodies; long text is truncated. */
function clean(text: string): string {
  const lines = text
    .replace(/\/\*\*[\s\S]*?\*\/\s*/g, '')
    .replace(/^(export\s+)?(default\s+)?(declare\s+)?/, '')
    .split('\n');
  const out = lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES), '  // …'] : lines;
  return out.join('\n').trim();
}

function header(decl: ts.ClassDeclaration | ts.InterfaceDeclaration): string {
  const text = decl.getText();
  const brace = text.indexOf('{');
  return clean(brace === -1 ? text : `${text.slice(0, brace).trimEnd()} { … }`);
}

function signatureOf(decls: ts.Declaration[], kind: ApiSymbol['kind']): string {
  if (kind === 'class' || kind === 'interface') return header(decls[0] as ts.ClassDeclaration);
  if (kind === 'variable') {
    const v = decls[0] as ts.VariableDeclaration;
    const keyword = v.parent.flags & ts.NodeFlags.Const ? 'const' : 'let';
    return clean(`${keyword} ${v.getText()}`);
  }
  return decls.map((d) => clean(d.getText())).join('\n');
}

function isPublicMember(m: ts.ClassElement | ts.TypeElement): boolean {
  const mods = ts.canHaveModifiers(m) ? (ts.getModifiers(m) ?? []) : [];
  if (mods.some((x) => x.kind === ts.SyntaxKind.PrivateKeyword || x.kind === ts.SyntaxKind.ProtectedKeyword)) return false;
  if (m.name && ts.isPrivateIdentifier(m.name)) return false;
  return true;
}

function memberKind(m: ts.Node): string {
  if (ts.isMethodDeclaration(m) || ts.isMethodSignature(m)) return 'method';
  if (ts.isConstructorDeclaration(m) || ts.isConstructSignatureDeclaration(m)) return 'constructor';
  if (ts.isGetAccessor(m)) return 'getter';
  if (ts.isSetAccessor(m)) return 'setter';
  if (ts.isIndexSignatureDeclaration(m)) return 'index';
  if (ts.isCallSignatureDeclaration(m)) return 'call';
  return 'property';
}

function membersOf(decl: ts.Declaration, checker: ts.TypeChecker): ApiMember[] {
  if (!ts.isClassDeclaration(decl) && !ts.isInterfaceDeclaration(decl)) return [];
  const members = decl.members as ts.NodeArray<ts.ClassElement | ts.TypeElement>;
  return members.filter(isPublicMember).map((m) => {
    const symbol = m.name ? checker.getSymbolAtLocation(m.name) : undefined;
    return {
      name: m.name ? m.name.getText() : ts.isConstructorDeclaration(m) ? 'constructor' : '(signature)',
      kind: memberKind(m),
      signature: clean(m.getText()),
      summary: symbol ? ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim() : '',
    };
  });
}

function symbolsOf(file: string, program: ts.Program): ApiSymbol[] {
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(file);
  const moduleSymbol = source ? checker.getSymbolAtLocation(source) : undefined;
  if (!moduleSymbol) return [];
  const out: ApiSymbol[] = [];
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    // Prefer the value declaration for merged symbols (class + interface, const + type).
    const decls = (symbol.declarations ?? []).filter((d) => kindOf(d) !== undefined);
    if (decls.length === 0) continue;
    const primary = decls.find((d) => !ts.isInterfaceDeclaration(d) && !ts.isTypeAliasDeclaration(d)) ?? decls[0];
    const kind = kindOf(primary)!;
    const sameKind = decls.filter((d) => kindOf(d) === kind);
    const tags = symbol.getJsDocTags(checker).map((t) => ({ name: t.name, text: ts.displayPartsToString(t.text).trim() }));
    out.push({
      name: exported.getName(),
      kind,
      signature: signatureOf(sameKind, kind),
      summary: ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim(),
      tags: tags.filter((t) => t.name !== 'deprecated'),
      deprecated: tags.find((t) => t.name === 'deprecated')?.text ?? null,
      members: membersOf(primary, checker),
    });
  }
  return out.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name));
}

interface ExportTarget {
  subpath: string;
  importPath: string;
  types: string;
}

function typeTargets(name: string, dir: string, exportsMap: Record<string, unknown> | undefined): ExportTarget[] {
  const out: ExportTarget[] = [];
  for (const [key, value] of Object.entries(exportsMap ?? {})) {
    if (key === './package.json' || typeof value !== 'object' || value === null) continue;
    const types = (value as { types?: string }).types;
    if (!types) continue;
    const subpath = key === '.' ? '' : key.slice(1);
    out.push({ subpath, importPath: `${name}${subpath}`, types: fromRoot('packages', dir, types) });
  }
  return out;
}

const CACHE_VERSION = 1;

function cacheKey(files: string[]): string {
  const hash = crypto.createHash('sha1').update(String(CACHE_VERSION));
  const dirs = new Set(files.map((f) => path.dirname(f)));
  for (const dir of [...dirs].sort()) {
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.d.ts')).sort()) hash.update(f).update(fs.readFileSync(path.join(dir, f)));
  }
  return hash.digest('hex');
}

/** API for one package, read from its built declarations. Throws if the package isn't built. */
export function apiForPackage(name: string, dir: string, exportsMap: Record<string, unknown> | undefined): ApiPackage {
  const targets = typeTargets(name, dir, exportsMap);
  const missing = targets.filter((t) => !fs.existsSync(t.types));
  if (missing.length > 0) {
    throw new ExplorerError('explorer/missing-source', `${name} isn't built (missing ${missing.map((m) => m.types).join(', ')}); run pnpm build first`);
  }
  const cacheFile = fromRoot('packages', 'explorer', '.cache', 'api', `${dir}.json`);
  const key = targets.length > 0 ? cacheKey(targets.map((t) => t.types)) : 'none';
  if (fs.existsSync(cacheFile)) {
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as { key: string; value: ApiPackage };
    if (cached.key === key) return cached.value;
  }
  const program = ts.createProgram(
    targets.map((t) => t.types),
    {
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      types: [],
    },
  );
  const value = validate(
    apiPackage,
    {
      package: name,
      slug: dir,
      entries: targets.map((t) => ({ subpath: t.subpath, importPath: t.importPath, symbols: symbolsOf(t.types, program) })),
    },
    `${name} declarations`,
  );
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify({ key, value }));
  return value;
}

export const loadApi = once(async (): Promise<ApiPackage[]> => {
  const { packages } = await readRawPackages();
  return packages.map((p) => apiForPackage(p.name, p.dir, p.pkg.exports)).sort((a, b) => a.package.localeCompare(b.package));
});
