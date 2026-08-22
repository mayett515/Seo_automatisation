#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.argv[2] ?? process.cwd();
const ignored = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".git",
  "build",
  ".next",
  ".turbo",
  "out",
  ".cache",
  "tmp"
]);
const stopwords = new Set([
  "Props",
  "Options",
  "Config",
  "Params",
  "Result",
  "Handler",
  "Context",
  "State",
  "Input",
  "Output"
]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (ignored.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) yield* walk(full);
    else if (
      /\.(ts|tsx|mts|cts)$/.test(entry) &&
      !entry.endsWith(".d.ts") &&
      !/\.(test|spec|integration)\./.test(entry)
    )
      yield full;
  }
}

function packageOf(path) {
  const parts = path.split(sep);
  for (const parent of ["packages", "apps"]) {
    const index = parts.indexOf(parent);
    if (index >= 0 && parts[index + 1]) return `${parent}/${parts[index + 1]}`;
  }
  return parts[0] ?? ".";
}

const schemas = [];
const declarations = new Map();

for (const file of walk(root)) {
  const source = readFileSync(file, "utf8");
  const rel = relative(root, file);
  const pkg = packageOf(rel);

  for (const match of source.matchAll(/const\s+(\w+?)Schema\s*(?::[^=\n]+)?=\s*z[.(]/g)) {
    schemas.push({ base: match[1], file: rel, pkg });
  }

  for (const match of source.matchAll(/export\s+(?:interface\s+(\w+)|type\s+(\w+)\s*(?:<[^>\n]*>)?\s*=)/g)) {
    const name = match[1] ?? match[2];
    const tail = source.slice(match.index, match.index + 400);
    const nextExport = tail.indexOf("\nexport ", 1);
    const declaration = nextExport > 0 ? tail.slice(0, nextExport) : tail;
    const derived =
      /z\.(infer|input|output)\s*</.test(declaration) ||
      /keyof typeof|typeof \w+\[|ReturnType\s*<|Parameters\s*</.test(declaration);
    declarations.set(name, [...(declarations.get(name) ?? []), { file: rel, pkg, derived }]);
  }
}

let findings = 0;
console.log("== Schema and non-derived same-name type in one package ==");
for (const schema of schemas) {
  for (const [name, sites] of declarations) {
    if (name.toLowerCase() !== schema.base.toLowerCase()) continue;
    for (const site of sites) {
      if (site.pkg === schema.pkg && !site.derived) {
        findings += 1;
        console.log(`  ${name}: schema in ${schema.file} | hand-written type in ${site.file}`);
      }
    }
  }
}

console.log("\n== Same exported type name in multiple packages ==");
for (const [name, sites] of declarations) {
  if (stopwords.has(name)) continue;
  if (new Set(sites.map((site) => site.pkg)).size > 1) {
    findings += 1;
    console.log(`  ${name}: ${sites.map((site) => site.file).join(" | ")}`);
  }
}

console.log(`\n${findings} candidate(s). Classify each as source, derivation, mirror, or deliberate DTO boundary.`);
