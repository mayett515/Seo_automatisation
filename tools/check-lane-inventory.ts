import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

// Every registry this checker reasons over is read through a normal import,
// never from source by regex.
//
// - `queueNames` is the code-owned lane list (packages/contracts).
// - `apiQueueNames` is the runtime list of queues the API may enqueue into, so
//   the checker and the enqueue path share one source. This is the
//   reachable-from-HTTP fact and covers HTTP only.
// - `executableLaneNames` is the list the worker's handler registry derives its
//   type from, so it states which lanes have a registered handler and cannot
//   drift from the dispatch table without a compile error.
//
// A registry read that yields nothing fails the check, it does not silently pass.
import { LaneLeafSchema, apiQueueNames, laneLeafFieldNames, queueNames } from "@localseo/contracts";

import { executableLaneNames } from "../apps/worker/src/lane-executability.js";
import { checkLaneInventory, type Finding, type LeafFile } from "./lane-inventory/core.js";

const LANES_DIR = "docs/agents/lanes";
const HANDLERS_DIR = "apps/worker/src/handlers";
const MAP_FILE = `${LANES_DIR}/generated-map.md`;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

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

function laneLeafFiles(): string[] {
  return readdirSync(HANDLERS_DIR)
    .filter((name) => name.endsWith(".lane.md"))
    .map((name) => `${HANDLERS_DIR}/${name}`);
}

function loadLeaves(findings: Finding[]): LeafFile[] {
  const loaded: LeafFile[] = [];

  for (const file of laneLeafFiles()) {
    const entries = parseFrontMatter(read(file));
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

function main(): void {
  const findings: Finding[] = [];

  // Fail closed on the registry relationship: every queue the API admits must
  // be one the code-owned queueNames declares, or the reachability facts below
  // would be about a queue that does not exist.
  const queueNameSet = new Set<string>(queueNames);
  for (const admitted of apiQueueNames) {
    if (!queueNameSet.has(admitted)) {
      findings.push({
        code: "API_QUEUE_NOT_IN_REGISTRY",
        message: `apiQueueNames admits "${admitted}" which is not in queueNames`
      });
    }
  }

  const leaves = loadLeaves(findings);

  // The domain parent must exist. Needs the fs, so it stays in the shell.
  for (const { file, leaf } of leaves) {
    if (!existsSync(`${LANES_DIR}/${leaf.domain}.md`)) {
      findings.push({
        code: "LEAF_DOMAIN_PARENT_MISSING",
        message: `${file}: domain "${leaf.domain}" has no parent at ${LANES_DIR}/${leaf.domain}.md`
      });
    }
  }

  const citing = [
    ...laneLeafFiles(),
    ...readdirSync(LANES_DIR)
      .filter((name) => name.endsWith(".md") && name !== "generated-map.md")
      .map((name) => `${LANES_DIR}/${name}`)
  ];

  const willWrite = process.argv.includes("--write");

  const result = checkLaneInventory(
    {
      queueNames,
      apiQueueNames,
      lanesWithRegisteredHandler: new Set<string>(executableLaneNames),
      leaves,
      mapFile: MAP_FILE,
      // When writing, the current content on disk is irrelevant: the generated
      // map is about to replace it, so a "stale" on the old copy is not a defect.
      existingMap: willWrite ? undefined : existsSync(MAP_FILE) ? read(MAP_FILE) : undefined,
      schemaSource: read(`${LANES_DIR}/SCHEMA.md`)
    },
    {
      files: citing,
      readFile: read,
      pathExists: existsSync
    }
  );

  for (const finding of result.findings) {
    findings.push(finding);
  }

  if (willWrite) {
    writeFileSync(MAP_FILE, result.map, "utf8");
    console.log(`Lane map written to ${MAP_FILE}.`);
  }

  if (findings.length > 0) {
    console.error(`Lane inventory check failed with ${findings.length} finding(s):`);
    for (const finding of findings) {
      console.error(`- [${finding.code}] ${finding.message}`);
    }
    process.exit(1);
  }

  console.log(
    `Lane inventory check passed for ${queueNames.length} lanes ` +
      `(${executableLaneNames.length} with a registered handler, ${laneLeafFieldNames.length} validated leaf fields).`
  );
}

main();
