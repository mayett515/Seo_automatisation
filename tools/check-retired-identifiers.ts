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
//
// The hooks run the tree pass only, deliberately. Giving them `--since HEAD`
// was the original plan and is wrong: the hook fires the moment a declaration
// is renamed, which is before the author has had any chance to repair the
// mentions, so every rename would produce a finding about work still in
// progress. The diff pass belongs where a change is finished and offered -
// the pull request. A hook that cries at the start of every rename is a hook
// people learn to ignore.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";

import { checkRemovedExports, checkRetiredIdentifiers, type Finding } from "./retired-identifiers/core.js";
import { retiredIdentifiers } from "./retired-identifiers/registry.js";
import { ACTIVE_FILES, ACTIVE_ROOTS, collectFiles, exportedNames } from "./retired-identifiers/scan.js";

const REGISTRY_PATH = "tools/retired-identifiers/registry.ts";

function git(args: readonly string[]): string {
  // stderr is discarded because two of the three callers treat failure as a
  // fact, not an error: a file added in this change has no content at the base
  // commit, and git says so on stderr with a non-zero exit. Letting that
  // through would print a `fatal:` line per new file above a passing run.
  return execFileSync("git", [...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"]
  });
}

/**
 * The commit to compare against. `git merge-base` is asked first so a branch
 * that has fallen behind does not report every file the base branch moved on
 * without it; `--since HEAD` resolves to HEAD and compares the working tree.
 */
function baseCommit(ref: string): string {
  try {
    return git(["merge-base", ref, "HEAD"]).trim();
  } catch {
    return ref;
  }
}

/** File contents at a commit. A file that did not exist there contributes nothing. */
function contentAt(commit: string, path: string): string {
  try {
    return git(["show", `${commit}:${path}`]);
  } catch {
    return "";
  }
}

function changedTypeScriptFiles(base: string): string[] {
  return git(["diff", "--name-only", base])
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".ts") || line.endsWith(".tsx") || line.endsWith(".mts"));
}

function unionOfExports(files: readonly string[], contentFor: (path: string) => string): Set<string> {
  const names = new Set<string>();
  for (const file of files) {
    const text = contentFor(file);
    if (text === "") continue;
    for (const name of exportedNames(file, text)) names.add(name);
  }
  return names;
}

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

/**
 * `--since <ref>` adds the discovery pass to the tree pass.
 *
 * Without it, this check only ever proves that names somebody already recorded
 * stay gone, so the mechanism waits on a person remembering to record the first
 * one. With it, an export that leaves the surface while its name still stands
 * in an active source is reported whether it was renamed or deleted - the
 * mention is stale either way, so the question does not have to be answered.
 */
function sinceRef(argv: readonly string[]): string | undefined {
  const index = argv.indexOf("--since");
  if (index < 0) return undefined;
  const ref = argv[index + 1];
  if (!ref || ref.startsWith("--")) {
    console.error("--since needs a git ref, for example: --since origin/main");
    process.exit(2);
  }
  return ref;
}

function main(): void {
  const files = collectFiles([...ACTIVE_ROOTS], [...ACTIVE_FILES], readDirectory, read, existsSync);

  const findings: Finding[] = [
    ...checkRetiredIdentifiers({
      entries: retiredIdentifiers,
      files,
      registryPath: REGISTRY_PATH,
      exportsByOwner: exportsByOwner()
    })
  ];

  const ref = sinceRef(process.argv);
  if (ref) {
    const base = baseCommit(ref);
    const changed = changedTypeScriptFiles(base);
    findings.push(
      ...checkRemovedExports({
        exportedBefore: unionOfExports(changed, (path) => contentAt(base, path)),
        exportedAfter: unionOfExports(changed, (path) => (existsSync(path) ? read(path) : "")),
        files,
        knownRetired: new Set(retiredIdentifiers.map((entry) => entry.retired)),
        registryPath: REGISTRY_PATH
      })
    );
  }

  if (findings.length > 0) {
    // The banner the shared after-edit hook matches to tell findings apart from
    // a checker that died; a crash exits 1 too.
    console.error(`Retired identifier check failed with ${findings.length} finding(s):\n`);
    for (const finding of findings) console.error(`  [${finding.code}] ${finding.message}`);
    process.exit(1);
  }

  // Say which passes ran. "Passed" without the scope is the kind of green that
  // gets read as more than it proves; the tree pass alone does not look at what
  // this change removed.
  const scope = ref ? `, and no export removed since ${ref} is still referenced` : "";
  console.log(
    `Retired identifier check passed for ${retiredIdentifiers.length} retired name(s) over ${files.length} active files${scope}.`
  );
}

main();
