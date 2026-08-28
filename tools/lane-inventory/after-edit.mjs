#!/usr/bin/env node
/**
 * Shared body of the after-edit lane inventory hook.
 *
 * Every host has a PostToolUse channel and every host describes the edit
 * differently: Claude passes `tool_input.file_path`, Cursor one of three keys,
 * agy `toolCall.args.TargetFile`, and Codex an `apply_patch` command with no
 * file path in it at all. Only the extraction is host-specific, so only the
 * extraction is duplicated - the decision of what counts as a lane input, and
 * the running and reporting of the checker, live here once. Four copies of this
 * logic would drift, and the copy that drifted would be the one that stopped
 * catching things while still looking installed.
 *
 * Reports, never repairs. `text:check` runs the same checker in CI and stays
 * the authority; this only moves the finding earlier, to where the reason for
 * the edit is still in context.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";

/**
 * The inventory's inputs. An edit anywhere else cannot invalidate it, and
 * running a repository-wide check after every edit would be noise.
 */
export const LANE_INPUTS =
  /(apps[\\/]worker[\\/]src[\\/](handlers[\\/][^\\/]+\.lane\.md|lane-handler-registration\.ts)|packages[\\/]contracts[\\/]src[\\/](jobs|lane-inventory)\.ts|docs[\\/]agents[\\/]lanes[\\/][^\\/]+\.md)$/i;

const CHECKER = "tools/check-lane-inventory.ts";
const TSX = "node_modules/tsx/dist/cli.mjs";

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

/** Walk up from a file to the repository that owns the checker. */
function findRepoRoot(startDir) {
  let dir = startDir;
  while (true) {
    if (existsSync(join(dir, CHECKER))) return dir;
    const parent = dirname(dir);
    if (parent === dir || dir === parse(dir).root) return undefined;
    dir = parent;
  }
}

/**
 * Run the checker for the given edited paths and exit the way the host expects:
 * 0 when nothing is wrong or nothing relevant was touched, 2 with the findings
 * on stderr when the inventory no longer holds.
 *
 * Only checker exit status 1 (findings) is reported. A crash, a missing
 * dependency, or a timeout stays silent - a broken checker must never
 * masquerade as a finding and loop the session.
 */
export function reportAndExit(paths) {
  const relevant = paths.filter((path) => typeof path === "string" && LANE_INPUTS.test(path));
  if (relevant.length === 0) process.exit(0);

  const root = findRepoRoot(dirname(relevant[0]));
  if (!root) process.exit(0);

  const tsx = join(root, TSX);
  if (!existsSync(tsx)) process.exit(0);

  try {
    execFileSync(process.execPath, [tsx, CHECKER], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000
    });
    process.exit(0);
  } catch (error) {
    if (error.status !== 1) process.exit(0); // crash / spawn / timeout: not a finding
    const out = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
    if (out === "") process.exit(0);
    console.error(
      `The lane inventory no longer holds after editing ${relevant.join(", ")}:\n${out.slice(0, 8000)}\n\n` +
        `A stale generated map is regenerated with: corepack pnpm exec tsx ${CHECKER} --write\n` +
        `Every other finding is a real contradiction between a leaf and the registries; fix the claim, not the checker.`
    );
    process.exit(2);
  }
}
