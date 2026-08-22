#!/usr/bin/env node
/**
 * find-drift.mjs — heuristic scanner for duplicate/mirrored type definitions.
 *
 * Flags, as CANDIDATES for the source-of-truth audit (not verdicts):
 *  1. A package that declares `const XSchema = z....` AND exports a
 *     non-derived `interface X` / `type X = ...` in the SAME package —
 *     a likely hand-written mirror. (Name match is case-insensitive.)
 *  2. The same exported type name declared in more than one package —
 *     possible duplicate truth across package boundaries. Generic names
 *     (Props, Config, ...) are stop-worded; .d.ts files are skipped.
 *
 * A clean run means the scanner found nothing — it does not prove nothing
 * exists. Grep-based classification (step 2 of the skill) still applies.
 *
 * Usage: node find-drift.mjs [rootDir]   (default: cwd)
 * Exit code: 0 always — reporting tool, not a CI gate. Promote confirmed
 * classes of drift into the host repo's guard script instead.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.argv[2] ?? process.cwd();
const IGNORED = new Set([
  "node_modules", "dist", "coverage", ".git", "build", ".next", ".turbo", "out", ".cache", "tmp",
]);
const STOPWORDS = new Set([
  "Props", "Options", "Config", "Params", "Result", "Handler", "Context", "State", "Input", "Output",
]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (IGNORED.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (
      /\.(ts|tsx|mts|cts)$/.test(entry) &&
      !entry.endsWith(".d.ts") &&
      !/\.(test|spec|integration)\./.test(entry)
    )
      yield full;
  }
}

function pkgOf(rel) {
  const parts = rel.split(sep);
  const i = parts.indexOf("packages");
  if (i >= 0 && parts[i + 1]) return `packages/${parts[i + 1]}`;
  const j = parts.indexOf("apps");
  if (j >= 0 && parts[j + 1]) return `apps/${parts[j + 1]}`;
  return parts[0] ?? ".";
}

const schemas = []; // { base, file, pkg }
const typeDecls = new Map(); // typeName -> [{file, pkg, derived}]

for (const file of walk(root)) {
  const src = readFileSync(file, "utf8");
  const rel = relative(root, file);
  const pkg = pkgOf(rel);

  // matches: const XSchema = z...., const XSchema: z.ZodType<X> = z....
  for (const m of src.matchAll(/const\s+(\w+?)Schema\s*(?::[^=\n]+)?=\s*z[.(]/g)) {
    schemas.push({ base: m[1], file: rel, pkg });
  }
  // matches: export interface X ... | export type X = / export type X<T> =
  for (const m of src.matchAll(/export\s+(?:interface\s+(\w+)|type\s+(\w+)\s*(?:<[^>\n]*>)?\s*=)/g)) {
    const name = m[1] ?? m[2];
    // derivation window: from the declaration to the next export (or 400 chars)
    const tail = src.slice(m.index, m.index + 400);
    const nextExport = tail.indexOf("\nexport ", 1);
    const windowText = nextExport > 0 ? tail.slice(0, nextExport) : tail;
    const derived =
      /z\.(infer|input|output)\s*</.test(windowText) ||
      /keyof typeof|typeof \w+\[|ReturnType\s*<|Parameters\s*</.test(windowText);
    const list = typeDecls.get(name) ?? [];
    list.push({ file: rel, pkg, derived });
    typeDecls.set(name, list);
  }
}

let findings = 0;

console.log("== Candidate mirrors (schema + non-derived same-name type in the SAME package) ==");
for (const { base, file, pkg } of schemas) {
  for (const [name, decls] of typeDecls) {
    if (name.toLowerCase() !== base.toLowerCase()) continue;
    for (const d of decls) {
      if (d.pkg !== pkg || d.derived) continue;
      findings++;
      console.log(`  ${name}: schema in ${file} | hand-written type in ${d.file}`);
    }
  }
}

console.log("\n== Same exported type name in multiple packages (stop-worded) ==");
for (const [name, decls] of typeDecls) {
  if (STOPWORDS.has(name)) continue;
  const pkgs = new Set(decls.map((d) => d.pkg));
  if (pkgs.size > 1) {
    findings++;
    console.log(`  ${name}: ${decls.map((d) => d.file).join(" | ")}`);
  }
}

console.log(
  `\n${findings} candidate(s). Each needs manual classification: source, derivation, mirror, or deliberate DTO boundary. A clean run is not proof — continue with the grep pass.`,
);
