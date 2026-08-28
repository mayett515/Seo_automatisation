#!/usr/bin/env node
/**
 * Shared body of the after-edit hooks, used by every agent host.
 *
 * Every host has a PostToolUse channel and every host describes the edit
 * differently: Claude passes `tool_input.file_path`, Cursor one of three keys,
 * agy `toolCall.args.TargetFile`, and Codex an `apply_patch` command with no
 * file path in it at all. Only the extraction is host-specific, so only the
 * extraction is duplicated - which check an edit deserves, and the running and
 * reporting of it, live here once. Copies of this logic would drift, and the
 * copy that drifted would be the one that stopped catching things while still
 * looking installed.
 *
 * These hooks add no coverage. `text:check` runs the same scripts in CI and
 * remains the authority. What they add is latency: the finding arrives while
 * the reason for the edit is still in context, instead of at pull-request time
 * when a document tends to be adjusted to make a red check go green rather than
 * because the claim in it was wrong.
 *
 * They report and never repair. An edit with a downstream consequence should
 * show that consequence, and a hook that quietly rewrites tracked files during
 * someone else's edit is the kind of invisible mechanism this layer exists to
 * avoid.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";

const TSX = "node_modules/tsx/dist/cli.mjs";

/**
 * Which edits deserve which check. An edit matching nothing here cannot
 * invalidate any of them, and running repository-wide checks after every edit
 * would be noise. A file may match more than one group; each runs once.
 */
const CHECKS = [
  {
    label: "lane inventory",
    inputs:
      /(apps[\\/]worker[\\/]src[\\/](handlers[\\/][^\\/]+\.lane\.md|lane-handler-registration\.ts)|packages[\\/]contracts[\\/]src[\\/](jobs|lane-inventory)\.ts|[\\/]docs[\\/]agents[\\/]lanes[\\/][^\\/]+\.md)$/i,
    checkers: ["tools/check-lane-inventory.ts"],
    remedy:
      "A stale generated map is regenerated with: corepack pnpm exec tsx tools/check-lane-inventory.ts --write\n" +
      "Every other finding is a real contradiction between a leaf and the registries; fix the claim, not the checker."
  },
  {
    // The rule layer and the documentation that carries load-bearing sentences.
    // The regression guards anchor specific wording here: a sentence deleted
    // because it looked redundant is exactly the edit this catches, and the
    // anchor names why the sentence exists.
    label: "rule anchors and document health",
    inputs:
      /([\\/](AGENTS|CLAUDE)\.md|[\\/]\.(claude|agents|codex|cursor)[\\/](rules|skills)[\\/].+\.md|[\\/]docs[\\/].+\.md|[\\/]\.(codex|cursor|agents)[\\/]hooks\.json)$/i,
    checkers: ["tools/check-architecture-regression-guards.ts", "tools/check-text-health.ts"],
    remedy:
      "An anchored sentence exists because deleting it once cost something; the anchor names the reason.\n" +
      "Restore the wording, or change the anchor in the same edit and say why."
  }
];

/** Read a hook payload from stdin. Returns undefined for anything unparseable. */
export async function readPayload() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return JSON.parse(raw.replace(/^\uFEFF+/, ""));
  } catch {
    return undefined;
  }
}

/** Walk up from a file to the repository that owns the checkers. */
function findRepoRoot(startDir) {
  let dir = startDir;
  while (true) {
    if (existsSync(join(dir, TSX))) return dir;
    const parent = dirname(dir);
    if (parent === dir || dir === parse(dir).root) return undefined;
    dir = parent;
  }
}

/**
 * Run the checks the given edited paths deserve and exit the way the host
 * expects: 0 when nothing is wrong or nothing relevant was touched, 2 with the
 * findings on stderr otherwise.
 *
 * Only checker exit status 1 (findings) is reported. A crash, a missing
 * dependency, or a timeout stays silent - a broken checker must never
 * masquerade as a finding and loop the session.
 */
export function reportAndExit(paths) {
  const edited = paths.filter((path) => typeof path === "string" && path !== "");
  const groups = CHECKS.filter((check) => edited.some((path) => check.inputs.test(path)));
  if (groups.length === 0) process.exit(0);

  const root = findRepoRoot(dirname(edited[0]));
  if (!root) process.exit(0);

  const tsx = join(root, TSX);
  if (!existsSync(tsx)) process.exit(0);

  const reports = [];
  for (const group of groups) {
    for (const checker of group.checkers) {
      if (!existsSync(join(root, checker))) continue;
      try {
        execFileSync(process.execPath, [tsx, checker], {
          cwd: root,
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 60_000
        });
      } catch (error) {
        if (error.status !== 1) continue; // crash / spawn / timeout: not a finding
        const out = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
        if (out !== "") reports.push(`${out}\n\n${group.remedy}`);
      }
    }
  }

  if (reports.length === 0) process.exit(0);

  console.error(
    `Editing ${edited.join(", ")} broke a check this repository owns:\n\n${reports.join("\n\n---\n\n").slice(0, 12000)}`
  );
  process.exit(2);
}
