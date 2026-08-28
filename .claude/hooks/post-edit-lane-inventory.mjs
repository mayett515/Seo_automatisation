#!/usr/bin/env node
/**
 * PostToolUse hook: after an edit to a file the lane inventory reasons over,
 * run the inventory checker and feed its findings back into the session.
 *
 * What this buys, stated honestly: nothing the gate does not already catch.
 * `text:check` runs the same checker in CI and remains the authority. What the
 * hook adds is latency - the finding arrives while the reason for the edit is
 * still in context, instead of at pull-request time when the leaf gets written
 * carelessly to make a red check go green.
 *
 * Reports, never repairs. A stale generated map is fixable with one command
 * and the message says which, but the hook does not run it: an edit that has a
 * downstream consequence should surface that consequence, and a hook that
 * quietly rewrites tracked files during someone else's edit is the kind of
 * invisible mechanism this layer exists to avoid.
 *
 * Robustness contract, same shape as post-edit-lint.mjs:
 *  - No shell: tsx's JS entry point runs under the current node binary, so
 *    paths with spaces are safe on every platform.
 *  - Only checker exit status 1 (findings) is reported. A crash, a missing
 *    dependency, or a timeout stays silent - a broken checker must never
 *    masquerade as a finding and loop the session.
 *  - Any malformed input or missing tool: silent.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";

// The inventory's inputs. An edit anywhere else cannot invalidate it, and
// running the checker on every edit in the repository would be noise.
const LANE_INPUTS =
  /(apps[\\/]worker[\\/]src[\\/](handlers[\\/][^\\/]+\.lane\.md|lane-handler-registration\.ts)|packages[\\/]contracts[\\/]src[\\/](jobs|lane-inventory)\.ts|docs[\\/]agents[\\/]lanes[\\/][^\\/]+\.md)$/i;

const CHECKER = "tools/check-lane-inventory.ts";
const TSX = "node_modules/tsx/dist/cli.mjs";

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;
input = input.replace(/^﻿+/, "");

let filePath;
try {
  filePath = JSON.parse(input)?.tool_input?.file_path;
} catch {
  process.exit(0); // malformed input: never block the session on hook bugs
}

if (!filePath || !LANE_INPUTS.test(filePath)) process.exit(0);

// Walk up from the edited file to the repository that owns the checker. The
// checker reads its inputs by relative path, so it must run from that root.
function findRepoRoot(startDir) {
  let dir = startDir;
  while (true) {
    if (existsSync(join(dir, CHECKER))) return dir;
    const parent = dirname(dir);
    if (parent === dir || dir === parse(dir).root) return undefined;
    dir = parent;
  }
}

const root = findRepoRoot(dirname(filePath));
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
  if (!out) process.exit(0);
  console.error(
    `The lane inventory no longer holds after editing ${filePath}:\n${out.slice(0, 8000)}\n\n` +
      `A stale generated map is regenerated with: corepack pnpm exec tsx ${CHECKER} --write\n` +
      `Every other finding is a real contradiction between a leaf and the registries; fix the claim, not the checker.`
  );
  process.exit(2);
}
