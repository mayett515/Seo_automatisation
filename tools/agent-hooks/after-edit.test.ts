import { deepStrictEqual, notStrictEqual, strictEqual } from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import { checkGroupsFor, findRepoRoot } from "./after-edit.mjs";

/**
 * These pin the two decisions that fail silently.
 *
 * The hook exits 0 both when a repository is healthy and when it never ran a
 * check at all, so neither the exit code nor a green gate can tell the two
 * apart. That is not hypothetical: the root marker was once
 * `node_modules/tsx`, which `apps/worker` installs for itself, so every edit to
 * a lane leaf resolved its root to `apps/worker`, found no checker there, and
 * was skipped. The hook stayed installed and reported nothing for a full
 * commit, and it was a reviewer who noticed, not the gate.
 */

const LANE_LEAF = "apps/worker/src/handlers/website-import.lane.md";
const LANE = "lane inventory";
const DOCS = "rule anchors and document health";
const RETIRED = "retired identifiers";

void test("a file inside a workspace package resolves to the repository root", () => {
  const root = findRepoRoot(dirname(resolve(LANE_LEAF)));

  notStrictEqual(root, undefined, "no root found for a file that is inside the repository");
  strictEqual(
    existsSync(join(String(root), "tools/check-lane-inventory.ts")),
    true,
    "the resolved root must be the directory the checkers live in"
  );
});

void test("the resolved root is not the nearest package that happens to install tsx", () => {
  // The exact regression, named. `apps/worker` has its own node_modules/tsx.
  const root = String(findRepoRoot(dirname(resolve(LANE_LEAF))));

  strictEqual(
    root.replaceAll("\\", "/").endsWith("apps/worker"),
    false,
    "root resolved to the worker package; every lane check would be skipped"
  );
});

void test("a lane leaf selects the lane inventory check", () => {
  deepStrictEqual(checkGroupsFor([LANE_LEAF]), [LANE, RETIRED]);
});

void test("the registries the inventory reads select it too", () => {
  deepStrictEqual(checkGroupsFor(["apps/worker/src/lane-handler-registration.ts"]), [LANE]);
  deepStrictEqual(checkGroupsFor(["packages/contracts/src/jobs.ts"]), [LANE, RETIRED]);
});

void test("a rule file selects the anchor and health checks", () => {
  deepStrictEqual(checkGroupsFor(["packages/contracts/AGENTS.md"]), [DOCS, RETIRED]);
  deepStrictEqual(checkGroupsFor([".claude/rules/boundaries.md"]), [DOCS]);
});

void test("a lane document selects both groups", () => {
  deepStrictEqual(checkGroupsFor(["docs/agents/lanes/ROOT.md"]), [LANE, DOCS, RETIRED]);
});

/**
 * The retired-identifier check reads two sides of one boundary: the code that
 * owns a name, and the documents where the old one survives. Both sides must
 * route, because the failure it guards against is precisely the edit that
 * changes one side and forgets the other.
 */
void test("both sides of a rename route to the retired-identifier check", () => {
  deepStrictEqual(checkGroupsFor(["tools/retired-identifiers/registry.ts"]), [RETIRED]);
  deepStrictEqual(checkGroupsFor([".ai-project-rules/02-stack-and-boundaries.md"]), [RETIRED]);
  // README is scanned for retired names but carries no rule anchors, so it
  // selects one group and not the other.
  deepStrictEqual(checkGroupsFor(["README.md"]), [RETIRED]);
});

void test("Windows paths route the same as POSIX ones", () => {
  // The path character classes lost their backslash alternative once already,
  // which would have made every absolute path on this platform match nothing.
  deepStrictEqual(checkGroupsFor(["C:\\repo\\apps\\worker\\src\\handlers\\report.lane.md"]), [LANE, RETIRED]);
  deepStrictEqual(checkGroupsFor(["C:\\repo\\packages\\contracts\\AGENTS.md"]), [DOCS, RETIRED]);
});

void test("a path that begins at the matched segment still routes", () => {
  // The trap that caught this layer twice: a pattern anchored on a leading
  // separator matches an absolute path and misses the relative form, where the
  // segment sits at position zero. Hosts pass both forms, and the miss is
  // silent - these four routed to nothing while the hook reported itself wired.
  deepStrictEqual(checkGroupsFor(["AGENTS.md"]), [DOCS, RETIRED]);
  deepStrictEqual(checkGroupsFor(["CLAUDE.md"]), [DOCS, RETIRED]);
  deepStrictEqual(checkGroupsFor([".codex/hooks.json"]), [DOCS]);
  // A progress README routes to the retired check and the check then ignores
  // it, because progress entries are historical and outside the scanned roots.
  // Over-matching costs a run; under-matching costs a finding, and a hook that
  // reports nothing is indistinguishable from a healthy repository.
  deepStrictEqual(checkGroupsFor(["docs/progress/README.md"]), [DOCS, RETIRED]);
});

void test("an ordinary source file selects nothing", () => {
  deepStrictEqual(checkGroupsFor(["apps/api/src/main.ts"]), []);
  deepStrictEqual(checkGroupsFor([]), []);
  deepStrictEqual(checkGroupsFor([undefined, ""]), []);
});
