import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

type RequiredTextFile = {
  path: string;
  minLines: number;
};

const requiredTextFiles: RequiredTextFile[] = [
  { path: ".env.example", minLines: 10 },
  { path: ".prettierignore", minLines: 5 },
  { path: ".gitattributes", minLines: 5 },
  { path: "package.json", minLines: 10 },
  { path: "README.md", minLines: 5 },
  { path: "AGENTS.md", minLines: 20 },
  { path: ".github/workflows/ci.yml", minLines: 20 },
  { path: "apps/api/src/main.ts", minLines: 15 },
  { path: "apps/api/src/modules/gsc.module.ts", minLines: 100 },
  { path: "packages/db/src/schema/opportunities.ts", minLines: 400 },
  { path: "packages/db/src/schema/pages.ts", minLines: 150 },
  { path: "docs/progress/2026-06-25.md", minLines: 20 }
];

const failures: string[] = [];

// Archived bundles (archive/.ai-*) are deliberately NOT health-checked:
// they are read-only history. Validated roots are the live product rules
// plus the deliberately retained frozen reference (.ai-rules).
const ruleRoots = [".ai-rules", ".ai-project-rules"] as const;

for (const file of requiredTextFiles) {
  const buffer = readFileSync(file.path);
  const text = buffer.toString("utf8");
  const lfCount = [...text].filter((char) => char === "\n").length;

  if (buffer.includes(0)) {
    failures.push(`${file.path}: contains NUL bytes; expected a text file`);
  }

  if (text.includes("\r")) {
    failures.push(`${file.path}: contains CR characters; expected LF-only text`);
  }

  if (!text.endsWith("\n")) {
    failures.push(`${file.path}: missing final newline`);
  }

  if (lfCount < file.minLines) {
    failures.push(
      `${file.path}: has ${lfCount} line breaks; expected at least ${file.minLines} to prevent flattened-file regressions`
    );
  }
}

assertRuleDependencyGraphAcyclic();

if (failures.length > 0) {
  console.error("Text health check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Text health check passed.");

function assertRuleDependencyGraphAcyclic(): void {
  const files = ruleRoots.flatMap((root) => (existsSync(root) ? markdownFiles(root) : []));
  const graph = new Map<string, string[]>();

  for (const file of files) {
    const dependencies = localRuleDependencies(readFileSync(file, "utf8"));
    const resolvedDependencies: string[] = [];
    for (const dependency of dependencies) {
      if (!existsSync(dependency)) {
        failures.push(`${file}: local rule dependency does not exist: ${dependency}`);
        continue;
      }
      if (files.includes(dependency)) resolvedDependencies.push(dependency);
    }
    graph.set(file, resolvedDependencies);
  }

  const state = new Map<string, "visiting" | "visited">();
  const stack: string[] = [];
  const visit = (file: string): void => {
    const current = state.get(file);
    if (current === "visited") return;
    if (current === "visiting") {
      const start = stack.indexOf(file);
      failures.push(`AI rule dependency cycle: ${[...stack.slice(start), file].join(" -> ")}`);
      return;
    }
    state.set(file, "visiting");
    stack.push(file);
    for (const dependency of graph.get(file) ?? []) visit(dependency);
    stack.pop();
    state.set(file, "visited");
  };

  for (const file of files) visit(file);
}

function markdownFiles(root: string): string[] {
  const absoluteRoot = resolve(root);
  const result: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith(".md")) result.push(repoPath(path));
    }
  };
  visit(absoluteRoot);
  return result.sort();
}

function localRuleDependencies(text: string): string[] {
  const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/u.exec(text)?.[1];
  if (!frontmatter) return [];
  const dependencies: string[] = [];
  let readingDependencies = false;
  for (const line of frontmatter.split("\n")) {
    const inlineDependencies = /^dependencies:\s*\[(.*)\]\s*$/u.exec(line)?.[1];
    if (inlineDependencies !== undefined) {
      for (const match of inlineDependencies.matchAll(/["']([^"']+)["']/gu)) {
        const dependency = match[1];
        if (dependency?.startsWith(".ai-") && dependency.endsWith(".md")) {
          dependencies.push(repoPath(dependency));
        }
      }
      readingDependencies = false;
      continue;
    }
    if (/^dependencies:\s*(?:\[\])?\s*$/u.test(line)) {
      readingDependencies = true;
      continue;
    }
    if (!readingDependencies) continue;
    const dependency = /^\s+-\s+["']([^"']+)["']\s*$/u.exec(line)?.[1];
    if (dependency) {
      if (dependency.startsWith(".ai-") && dependency.endsWith(".md")) dependencies.push(repoPath(dependency));
      continue;
    }
    if (/^[a-zA-Z_][a-zA-Z0-9_]*:/u.test(line)) break;
  }
  return dependencies;
}

function repoPath(path: string): string {
  return relative(process.cwd(), resolve(path)).replaceAll("\\", "/");
}
