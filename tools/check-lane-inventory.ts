import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";

// Every registry this checker reasons over is read through a normal import,
// never from source by regex.
//
// - `queueNames` is the code-owned lane list (packages/contracts).
// - `sharedApiQueueNames` is the runtime list of queues the API may enqueue into, so
//   the checker and the shared enqueue path have one source. It proves
//   admission by that producer, not reachability over HTTP: a module that
//   builds its own queue bypasses the list, and gsc.module.ts does.
// - `lanesWithRegisteredHandler` is the list the worker's handler registry derives its
//   type from, so it states which lanes have a registered handler and cannot
//   drift from the dispatch table without a compile error.
//
// A registry read that yields nothing fails the check, it does not silently pass.
import { sharedApiQueueNames, laneLeafFieldNames, queueNames } from "@localseo/contracts";

import { lanesWithRegisteredHandler } from "../apps/worker/src/lane-handler-registration.js";
import { checkLaneInventory, type Finding } from "./lane-inventory/core.js";
import { checkApiRegistryRelationship, checkDomainParents, loadLeaves } from "./lane-inventory/intake.js";

const LANES_DIR = "docs/agents/lanes";
const HANDLERS_DIR = "apps/worker/src/handlers";
const MAP_FILE = `${LANES_DIR}/generated-map.md`;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function laneLeafFiles(): string[] {
  return readdirSync(HANDLERS_DIR)
    .filter((name) => name.endsWith(".lane.md"))
    .map((name) => `${HANDLERS_DIR}/${name}`);
}

function main(): void {
  const findings: Finding[] = [];

  findings.push(...checkApiRegistryRelationship(sharedApiQueueNames, queueNames));

  const leaves = loadLeaves(laneLeafFiles(), read, findings);

  findings.push(...checkDomainParents(leaves, LANES_DIR, existsSync));

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
      sharedApiQueueNames,
      lanesWithRegisteredHandler: new Set<string>(lanesWithRegisteredHandler),
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
      pathExists: existsSync,
      // A proof that resolves to a directory used to satisfy the file check.
      pathIsFile: (path) => existsSync(path) && statSync(path).isFile()
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
      `(${lanesWithRegisteredHandler.length} with a registered handler, ${laneLeafFieldNames.length} validated leaf fields).`
  );
}

main();
