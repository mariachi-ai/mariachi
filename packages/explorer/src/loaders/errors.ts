import fs from 'node:fs';
import path from 'node:path';
import { errorToHttpStatus, MariachiError } from '@mariachi/core';
import ts from 'typescript';
import { type ErrorEntry, errorEntry, validate } from '../data/schema';
import { fromRoot, once, relative } from '../lib/repo';
import { readRawPackages } from './packages';

interface ErrorClass {
  base: string | undefined;
  /** Set when the constructor calls `super('<literal code>', …)`: the code is fixed, args shift. */
  fixedCode: string | undefined;
  hasConstructor: boolean;
}

export interface ScanResult {
  errors: ErrorEntry[];
  /** `new XError(...)` calls whose code isn't a literal or template (reported, not indexed). */
  dynamic: { className: string; file: string; line: number }[];
}

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'test' ? [] : sourceFiles(p);
    return /\.ts$/.test(e.name) && !/\.(test|spec|d)\.ts$/.test(e.name) ? [p] : [];
  });
}

/** Literal text of a code argument; template expressions become `*` (`billing/${x}` → `billing/*`). */
function literalOf(node: ts.Expression | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((s) => `*${s.literal.text}`).join('');
  return undefined;
}

/** A message argument as readable text: template substitutions become `{expr}`; other expressions give ''. */
function messageOf(node: ts.Expression | undefined, sf: ts.SourceFile): string {
  if (!node) return '';
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((s) => `{${s.expression.getText(sf)}}${s.literal.text}`).join('');
  return '';
}

function collectClasses(files: { file: string; sf: ts.SourceFile }[]): Map<string, ErrorClass> {
  const classes = new Map<string, ErrorClass>();
  for (const { sf } of files) {
    ts.forEachChild(sf, function visit(node) {
      if (ts.isClassDeclaration(node) && node.name) {
        const base = node.heritageClauses
          ?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)
          ?.types[0]?.expression.getText(sf);
        const ctor = node.members.find(ts.isConstructorDeclaration);
        let fixedCode: string | undefined;
        ctor?.body?.forEachChild(function find(n) {
          if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.SuperKeyword) fixedCode ??= literalOf(n.arguments[0]);
          n.forEachChild(find);
        });
        classes.set(node.name.text, { base, fixedCode, hasConstructor: ctor !== undefined });
      }
      ts.forEachChild(node, visit);
    });
  }
  return classes;
}

/** True when `name` is MariachiError or extends it, directly or through other classes. */
function isErrorClass(name: string, classes: Map<string, ErrorClass>, seen = new Set<string>()): boolean {
  if (name === 'MariachiError') return true;
  if (seen.has(name)) return false;
  seen.add(name);
  const base = classes.get(name)?.base;
  return base !== undefined && isErrorClass(base, classes, seen);
}

/** The fixed code a class always uses, following classes without their own constructor. */
function fixedCodeOf(name: string, classes: Map<string, ErrorClass>): string | undefined {
  const c = classes.get(name);
  if (!c || name === 'MariachiError') return undefined;
  if (c.hasConstructor) return c.fixedCode;
  return c.base ? fixedCodeOf(c.base, classes) : undefined;
}

function httpStatus(code: string): number | null {
  if (code.includes('*')) return null;
  try {
    return errorToHttpStatus(new MariachiError(code, ''));
  } catch {
    return null;
  }
}

/**
 * Finds every `new <X>Error(...)` where X extends MariachiError (directly or through other
 * classes) in the given files. `packageName` is reported as the error's package.
 */
export function scanErrors(sources: { file: string; packageName: string }[]): ScanResult {
  const files = sources.map(({ file, packageName }) => ({
    file,
    packageName,
    sf: ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true),
  }));
  const classes = collectClasses(files);
  const errors: ErrorEntry[] = [];
  const dynamic: ScanResult['dynamic'] = [];
  for (const { file, packageName, sf } of files) {
    ts.forEachChild(sf, function visit(node) {
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && isErrorClass(node.expression.text, classes)) {
        const className = node.expression.text;
        const args = node.arguments ?? ts.factory.createNodeArray();
        const fixed = fixedCodeOf(className, classes);
        const code = fixed ?? literalOf(args[0]);
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        if (code === undefined) {
          dynamic.push({ className, file: relative(file), line });
        } else {
          errors.push({
            code,
            className,
            package: packageName,
            file: relative(file),
            line,
            message: messageOf(fixed ? args[0] : args[1], sf),
            http: httpStatus(code),
          });
        }
      }
      ts.forEachChild(node, visit);
    });
  }
  errors.sort((a, b) => a.code.localeCompare(b.code) || a.file.localeCompare(b.file) || a.line - b.line);
  return { errors: errors.map((e) => validate(errorEntry, e, `${e.file}:${e.line}`)), dynamic };
}

export const loadErrors = once(async (): Promise<ScanResult> => {
  const { packages } = await readRawPackages();
  return scanErrors(packages.flatMap((p) => sourceFiles(fromRoot('packages', p.dir, 'src')).map((file) => ({ file, packageName: p.name }))));
});
