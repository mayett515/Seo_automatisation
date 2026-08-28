// The shell's intake: turning a directory tree into files to scan, and a
// TypeScript file into the set of names it exports. Split out of
// tools/check-retired-identifiers.ts so both can be tested without executing the
// checker, and so the filesystem is injected rather than reached for.
//
// Exports are read with the TypeScript parser, never by importing the owner and
// never by regex. Importing would run module initialisation - environment
// parsing, provider construction, whatever the module does at load - inside a
// text check, and a text check must not be able to fail because a database URL
// is unset. Parsing also treats a value export and a type export alike, which
// an import cannot: `SharedApiQueueName` does not exist at runtime.

import ts from "typescript";

import type { ScannedFile } from "./core.js";

/**
 * Roots whose documents are active claims about the system.
 *
 * `.ai-project-rules` is in deliberately: it is a live product layer, and
 * leaving it out would have left exactly the class of document this check
 * exists for unguarded.
 */
export const ACTIVE_ROOTS = [
  "apps",
  "packages",
  "tools",
  "docs/agents",
  "docs/architecture",
  ".ai-project-rules",
  ".claude/rules",
  ".claude/skills",
  ".agents/rules",
  ".agents/skills",
  ".codex/rules",
  ".cursor/rules"
] as const;

/** Single files at the repository root that carry the same weight. */
export const ACTIVE_FILES = ["AGENTS.md", "CLAUDE.md", "README.md"] as const;

/**
 * Roots that record the past and must keep their own words.
 *
 * A progress entry describing the system as it was on a given day is a correct
 * record; rewriting it would falsify a record rather than fix one. `.ai-rules`
 * and `archive` are frozen by decision, and the knowledge pack is the product
 * plan written before implementation - it predates every name in the code.
 */
export const HISTORICAL_ROOTS = [
  "archive",
  "docs/progress",
  ".ai-rules",
  "local-seo-product-knowledge-pack",
  "deployment-agent-extension-only",
  "node_modules"
] as const;

const SCANNED_EXTENSIONS = [".ts", ".tsx", ".mts", ".md"] as const;

export type DirectoryReader = (path: string) => readonly { name: string; isDirectory: boolean }[];
export type FileReader = (path: string) => string;

function isScannable(name: string): boolean {
  return SCANNED_EXTENSIONS.some((extension) => name.endsWith(extension));
}

/**
 * Collect the active files under the given roots. A root that does not exist is
 * skipped rather than failing: the roots list is shared with hosts that do not
 * all install the same directories.
 */
export function collectFiles(
  roots: readonly string[],
  files: readonly string[],
  readDirectory: DirectoryReader,
  readFile: FileReader,
  pathExists: (path: string) => boolean
): ScannedFile[] {
  const collected: ScannedFile[] = [];

  const visit = (directory: string): void => {
    for (const entry of readDirectory(directory)) {
      const path = `${directory}/${entry.name}`;
      if (HISTORICAL_ROOTS.some((root) => path === root || path.startsWith(`${root}/`))) continue;
      if (entry.isDirectory) {
        if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
        visit(path);
        continue;
      }
      if (isScannable(entry.name)) collected.push({ path, text: readFile(path) });
    }
  };

  for (const root of roots) {
    if (!pathExists(root)) continue;
    visit(root);
  }

  for (const file of files) {
    if (pathExists(file)) collected.push({ path: file, text: readFile(file) });
  }

  return collected;
}

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    ? (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    : false;
}

function bindingNames(name: ts.BindingName, into: Set<string>): void {
  if (ts.isIdentifier(name)) {
    into.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) bindingNames(element.name, into);
  }
}

/**
 * The names a TypeScript source exports, values and types alike.
 *
 * Existence-only and deliberately bounded: it proves the name is exported by
 * this file, not that the thing behind it is correct, and it does not follow
 * `export * from` to another module.
 */
export function exportedNames(path: string, text: string): Set<string> {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const names = new Set<string>();

  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      const bindings = statement.exportClause;
      if (bindings && ts.isNamedExports(bindings)) {
        for (const element of bindings.elements) names.add(element.name.text);
      }
      continue;
    }

    if (!hasExportModifier(statement)) continue;

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) bindingNames(declaration.name, names);
      continue;
    }

    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    ) {
      names.add(statement.name.text);
    }
  }

  return names;
}
