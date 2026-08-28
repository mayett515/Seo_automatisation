// Fails the build when a retired identifier is still present in an active
// source, or when a registry entry names a replacement its owner does not
// export.
//
// This exists because a rename crossed an untyped boundary and every gate
// stayed green. `apiQueueNames` became `sharedApiQueueNames` in the code, the
// tests, the generated lane map and the finding codes; free prose in
// docs/agents/lanes/SCHEMA.md and in two lane leaves kept the retired name. No
// gate was wrong: the typechecker does not read Markdown, the lane checker
// reads only front matter, text health checks format rather than the truth of a
// sentence. Many gates are not the same thing as broad proof coverage.
//
// What this check is, precisely: a name-level absence check over a named set of
// roots. It cannot tell whether the sentence around a name is true - two lane
// leaves held conclusions that were wrong under either spelling - and it must
// not be cited as if it could. It is also deliberately not the mirror rule "the
// new name must stand where the old one stood": deleting a sentence is often
// the honest repair, and demanding the successor teaches authors to paste a
// name in to turn a check green.
//
// The post-edit hooks run this same script for early feedback after an edit.
// They report after the fact and change nothing; the blocking authority is
// `text:check` and the required CI checks.

import { existsSync, readFileSync, readdirSync } from "node:fs";

import { checkRetiredIdentifiers, type Finding } from "./retired-identifiers/core.js";
import { retiredIdentifiers } from "./retired-identifiers/registry.js";
import { ACTIVE_FILES, ACTIVE_ROOTS, collectFiles, exportedNames } from "./retired-identifiers/scan.js";

const REGISTRY_PATH = "tools/retired-identifiers/registry.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function readDirectory(path: string): { name: string; isDirectory: boolean }[] {
  return readdirSync(path, { withFileTypes: true }).map((entry) => ({
    name: entry.name,
    isDirectory: entry.isDirectory()
  }));
}

/**
 * Parse each replacement owner once, statically. A missing entry means the file
 * could not be read, which the core reports rather than passing over.
 */
function exportsByOwner(): Map<string, ReadonlySet<string>> {
  const owners = new Map<string, ReadonlySet<string>>();
  for (const entry of retiredIdentifiers) {
    const owner = entry.replacement?.owner;
    if (!owner || owners.has(owner) || !existsSync(owner)) continue;
    owners.set(owner, exportedNames(owner, read(owner)));
  }
  return owners;
}

function main(): void {
  const files = collectFiles([...ACTIVE_ROOTS], [...ACTIVE_FILES], readDirectory, read, existsSync);

  const findings: readonly Finding[] = checkRetiredIdentifiers({
    entries: retiredIdentifiers,
    files,
    registryPath: REGISTRY_PATH,
    exportsByOwner: exportsByOwner()
  });

  if (findings.length > 0) {
    // The banner the shared after-edit hook matches to tell findings apart from
    // a checker that died; a crash exits 1 too.
    console.error(`Retired identifier check failed with ${findings.length} finding(s):\n`);
    for (const finding of findings) console.error(`  [${finding.code}] ${finding.message}`);
    process.exit(1);
  }

  console.log(
    `Retired identifier check passed for ${retiredIdentifiers.length} retired name(s) over ${files.length} active files.`
  );
}

main();
