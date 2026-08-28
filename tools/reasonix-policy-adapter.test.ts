import { spawnSync } from "node:child_process";
import { deepStrictEqual, ok } from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

/**
 * The adapter lets Reasonix run the same policy scripts Claude Code runs. Three
 * things differ between the two hosts, and every one of them failed silently
 * when it was wrong: the tool name (`write_file`, not `write`), the argument key
 * (`path`, not `file_path`), and the path form (repo-relative, not absolute).
 *
 * A wrong value in any of the three does not raise anything. The target script
 * finds no field it recognises, exits 0, and the write goes through while
 * `reasonix hook list` still reports the hook as active. That is why these are
 * tests and not a comment: the failure mode of this file is silence.
 *
 * Payload shape probed against a real Reasonix run on 2026-08-26:
 *   {"event":"PreToolUse","cwd":"...","toolName":"write_file",
 *    "toolArgs":{"path":"archive/note.md","content":"ok"}}
 */

const adapter = ".reasonix/hooks/claude-policy-adapter.mjs";
const protectPaths = ".claude/hooks/protect-paths.mjs";
const guardBash = ".claude/hooks/guard-bash.mjs";

const BLOCKED = 2;
const ALLOWED = 0;

type Outcome = { status: number; stderr: string };

function askPolicy(target: string, toolName: string, toolArgs: Record<string, unknown>): Outcome {
  const result = spawnSync(process.execPath, [adapter, target], {
    input: JSON.stringify({
      event: "PreToolUse",
      cwd: process.cwd(),
      toolName,
      toolArgs
    }),
    encoding: "utf8"
  });
  return { status: result.status ?? -1, stderr: result.stderr };
}

void test("a repo-relative path into a protected directory is blocked", () => {
  // The bug this pins: `[\\/]archive[\\/]` needs a separator before `archive`,
  // which an absolute path has and a relative one does not. Reasonix created
  // the file while the hook ran and reported success.
  const outcome = askPolicy(protectPaths, "write_file", {
    path: "archive/hook-probe.md",
    content: "ok"
  });

  deepStrictEqual(outcome.status, BLOCKED);
  ok(outcome.stderr.includes("read-only history"), `expected the archive reason, got: ${outcome.stderr}`);
});

void test("an absolute path into a protected directory is blocked too", () => {
  const outcome = askPolicy(protectPaths, "write_file", {
    path: resolve("archive/hook-probe.md"),
    content: "ok"
  });

  deepStrictEqual(outcome.status, BLOCKED);
});

void test("an ordinary source file is allowed", () => {
  // A policy that blocks everything is as useless as one that blocks nothing,
  // and it looks correct in a test that only checks the blocking direction.
  const outcome = askPolicy(protectPaths, "write_file", {
    path: "apps/api/src/some-new-file.ts",
    content: "export const x = 1;"
  });

  deepStrictEqual(outcome.status, ALLOWED);
});

void test("an unmapped tool carries no policy here and is allowed", () => {
  const outcome = askPolicy(protectPaths, "read_file", { path: "archive/anything.md" });
  deepStrictEqual(outcome.status, ALLOWED);
});

void test("the write policy hangs on the tool name Reasonix actually sends", () => {
  // `write` was the first guess and it enforced nothing: unmapped tools are
  // allowed, so the same protected path went straight through while the hook
  // reported itself active. Asserting the allow here is deliberate - it pins
  // that the name in the settings file is load-bearing, not decorative.
  const wrongName = askPolicy(protectPaths, "write", {
    path: "archive/hook-probe.md",
    content: "ok"
  });
  const rightName = askPolicy(protectPaths, "write_file", {
    path: "archive/hook-probe.md",
    content: "ok"
  });

  deepStrictEqual(wrongName.status, ALLOWED);
  deepStrictEqual(rightName.status, BLOCKED);
});

void test("the shared Bash policy blocks a force push", () => {
  // Built at runtime: the string is itself blocked by this policy when it
  // appears in a command line, including in a commit message.
  const forcePush = ["git", "push", `--${"force"}`, "origin", "main"].join(" ");
  const outcome = askPolicy(guardBash, "bash", { command: forcePush });

  deepStrictEqual(outcome.status, BLOCKED);
});

void test("the shared Bash policy allows an ordinary command", () => {
  const outcome = askPolicy(guardBash, "bash", { command: "ls apps/api/src" });
  deepStrictEqual(outcome.status, ALLOWED);
});
