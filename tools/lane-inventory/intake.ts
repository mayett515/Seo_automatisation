// The shell's intake: turning files and registries into validated leaves and
// findings. Split out of tools/check-lane-inventory.ts so these can be tested
// without executing the checker, and so the filesystem is injected rather than
// reached for.
//
// Three finding codes are emitted only here and nowhere in the pure core -
// LEAF_SHAPE_INVALID, API_QUEUE_NOT_IN_REGISTRY and LEAF_DOMAIN_PARENT_MISSING.
// They were named test debt in SCHEMA.md for two rounds: the core suite could
// stay green while the parser or the wiring regressed, because the core never
// sees this layer.

import { LaneLeafSchema } from "@localseo/contracts";

import type { Finding, LeafFile } from "./core.js";

// Front matter uses a small, fixed subset: scalars, quoted strings, and flat
// lists. Parsed here, in the shell, because it is filesystem-shaped; the core
// only ever sees leaves the contract schema has already accepted.
function parseFrontMatter(source: string): Record<string, string> | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(source);
  if (!match) return undefined;

  const entries: Record<string, string> = {};
  let key = "";
  for (const line of (match[1] ?? "").split(/\r?\n/u)) {
    const start = /^([a-z]+):\s*(.*)$/u.exec(line);
    if (start) {
      key = start[1] ?? "";
      entries[key] = start[2] ?? "";
      continue;
    }
    if (key) {
      entries[key] = `${entries[key] ?? ""} ${line.trim()}`.trim();
    }
  }
  return entries;
}

function parseList(raw: string): string[] {
  const inner = raw.replace(/^\[/u, "").replace(/\]$/u, "").trim();
  if (inner === "") return [];
  return inner
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/u)
    .map((item) => item.trim().replace(/^"/u, "").replace(/"$/u, ""))
    .filter((item) => item !== "");
}

function parseScalar(raw: string): string {
  return raw.trim().replace(/^"/u, "").replace(/"$/u, "");
}

/** `missing` is the only list-valued field; everything else stays a scalar. */
function toRawLeaf(entries: Record<string, string>): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entries)) {
    raw[key] = key === "missing" ? parseList(value) : parseScalar(value);
  }
  return raw;
}

function describeZodIssues(error: { issues: readonly { path: PropertyKey[]; message: string }[] }): string {
  return error.issues
    .map((issue) => `${issue.path.length === 0 ? "(leaf)" : issue.path.join(".")}: ${issue.message}`)
    .join("; ");
}

/**
 * Parse and validate every leaf file. A file that cannot be parsed produces a
 * finding and is dropped rather than guessed at, so the core only ever sees
 * leaves the contract schema accepted.
 */
export function loadLeaves(
  files: readonly string[],
  readFile: (path: string) => string,
  findings: Finding[]
): LeafFile[] {
  const loaded: LeafFile[] = [];

  for (const file of files) {
    const entries = parseFrontMatter(readFile(file));
    if (!entries) {
      findings.push({ code: "LEAF_SHAPE_INVALID", message: `${file}: no front matter block` });
      continue;
    }

    const parsed = LaneLeafSchema.safeParse(toRawLeaf(entries));
    if (!parsed.success) {
      findings.push({ code: "LEAF_SHAPE_INVALID", message: `${file}: ${describeZodIssues(parsed.error)}` });
      continue;
    }

    loaded.push({ file, leaf: parsed.data });
  }

  return loaded;
}

/**
 * Fail closed on the registry relationship: every queue the shared API producer
 * admits must be one the code-owned `queueNames` declares, or every fact the
 * checker derives would be about a queue that does not exist.
 */
export function checkApiRegistryRelationship(
  sharedApiQueueNames: readonly string[],
  queueNames: readonly string[]
): Finding[] {
  const declared = new Set<string>(queueNames);
  return sharedApiQueueNames
    .filter((admitted) => !declared.has(admitted))
    .map((admitted) => ({
      code: "API_QUEUE_NOT_IN_REGISTRY" as const,
      message: `sharedApiQueueNames admits "${admitted}" which is not in queueNames`
    }));
}

/** Every leaf's domain must have a parent document. Needs the filesystem, so it is injected. */
export function checkDomainParents(
  leaves: readonly LeafFile[],
  lanesDir: string,
  pathExists: (path: string) => boolean
): Finding[] {
  return leaves
    .filter(({ leaf }) => !pathExists(`${lanesDir}/${leaf.domain}.md`))
    .map(({ file, leaf }) => ({
      code: "LEAF_DOMAIN_PARENT_MISSING" as const,
      message: `${file}: domain "${leaf.domain}" has no parent at ${lanesDir}/${leaf.domain}.md`
    }));
}
