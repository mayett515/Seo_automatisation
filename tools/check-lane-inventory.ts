import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

// The queue-name registry is read through a normal import, never from source by
// regex. `queueNames` is the code-owned list (packages/contracts), and
// `apiQueueNames` is the runtime list the API producer exports so the checker
// and the enqueue path share one source. A registry read that yields nothing
// fails the check, it does not silently pass.
import { apiQueueNames, queueNames } from "@localseo/contracts";

import { checkLaneInventory, LEAF_FIELDS, type Failure, type Leaf } from "./lane-inventory/core.js";

const LANES_DIR = "docs/agents/lanes";
const HANDLERS_DIR = "apps/worker/src/handlers";
const MAP_FILE = `${LANES_DIR}/generated-map.md`;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

// Front matter uses a small, fixed subset: scalars, quoted strings, and flat
// lists. Parsed here, in the shell, because it is filesystem-shaped; the core
// only ever sees parsed leaves.
function parseFrontMatter(source: string, file: string, failures: Failure[]): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(source);
  if (!match) {
    failures.push({ check: "2-shape", message: `${file}: no front matter block` });
    return {};
  }

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

function loadLeaves(failures: Failure[]): Leaf[] {
  return readdirSync(HANDLERS_DIR)
    .filter((name) => name.endsWith(".lane.md"))
    .map((name) => {
      const file = `${HANDLERS_DIR}/${name}`;
      const fields = parseFrontMatter(read(file), file, failures);

      for (const field of LEAF_FIELDS) {
        if (!(field in fields)) {
          failures.push({ check: "2-shape", message: `${file}: missing field "${field}"` });
        }
      }
      for (const field of Object.keys(fields)) {
        if (!LEAF_FIELDS.includes(field as (typeof LEAF_FIELDS)[number])) {
          failures.push({
            check: "10-schema-drift",
            message: `${file}: field "${field}" is not documented in SCHEMA.md`
          });
        }
      }

      return {
        file,
        lane: parseScalar(fields.lane ?? ""),
        domain: parseScalar(fields.domain ?? ""),
        state: parseScalar(fields.state ?? ""),
        missing: parseList(fields.missing ?? "[]"),
        reason: parseScalar(fields.reason ?? ""),
        trigger: parseScalar(fields.trigger ?? ""),
        proof: parseScalar(fields.proof ?? "")
      };
    });
}

function main(): void {
  const failures: Failure[] = [];

  // Fail closed on the registry relationship: every queue the API admits must
  // be one the code-owned queueNames declares, or the reachability check below
  // would be reasoning about a queue that does not exist.
  const queueNameSet = new Set<string>(queueNames);
  for (const admitted of apiQueueNames) {
    if (!queueNameSet.has(admitted)) {
      failures.push({
        check: "1-registry",
        message: `apiQueueNames admits "${admitted}" which is not in queueNames`
      });
    }
  }

  const leaves = loadLeaves(failures);

  // 9. the domain parent must exist (needs the fs, so it stays in the shell).
  for (const leaf of leaves) {
    if (!existsSync(`${LANES_DIR}/${leaf.domain}.md`)) {
      failures.push({
        check: "9-domain",
        message: `${leaf.file}: domain "${leaf.domain}" has no parent at ${LANES_DIR}/${leaf.domain}.md`
      });
    }
  }

  const citing = [
    ...readdirSync(HANDLERS_DIR)
      .filter((name) => name.endsWith(".lane.md"))
      .map((name) => `${HANDLERS_DIR}/${name}`),
    ...readdirSync(LANES_DIR)
      .filter((name) => name.endsWith(".md") && name !== "generated-map.md")
      .map((name) => `${LANES_DIR}/${name}`)
  ];

  const willWrite = process.argv.includes("--write");

  const result = checkLaneInventory(
    {
      queueNames,
      apiQueueNames,
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

  for (const failure of result.failures) {
    failures.push(failure);
  }

  if (willWrite) {
    writeFileSync(MAP_FILE, result.map, "utf8");
    console.log(`Lane map written to ${MAP_FILE}.`);
  }

  if (failures.length > 0) {
    console.error(`Lane inventory check failed with ${failures.length} problem(s):`);
    for (const failure of failures) {
      console.error(`- [${failure.check}] ${failure.message}`);
    }
    process.exit(1);
  }

  console.log(`Lane inventory check passed for ${queueNames.length} lanes.`);
}

main();
