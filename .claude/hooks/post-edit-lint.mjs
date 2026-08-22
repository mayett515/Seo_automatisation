#!/usr/bin/env node
/**
 * PostToolUse hook: run ESLint on the file Claude just edited and feed
 * violations straight back into the session (exit 2 + stderr).
 *
 * Robustness contract:
 *  - No shell involved: the repo-local eslint JS entry point runs under the
 *    current node binary, so paths with spaces are safe on every platform.
 *  - Only ESLint exit status 1 (lint problems) is reported. Status 2 (fatal
 *    config error), spawn failures, and timeouts stay silent — a broken
 *    linter must never masquerade as a lint violation and loop the session.
 *  - Missing eslint installation: silent.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";

const LINTABLE = /\.(ts|tsx|mts|cts|js|jsx)$/;

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;
input = input.replace(/^\uFEFF+/, "");

let filePath;
try {
  filePath = JSON.parse(input)?.tool_input?.file_path;
} catch {
  process.exit(0); // malformed input: never block the session on hook bugs
}

if (!filePath || !LINTABLE.test(filePath) || !existsSync(filePath)) process.exit(0);

// Walk up from the edited file to the nearest installed eslint JS entry.
function findEslintJs(startDir) {
  let dir = startDir;
  while (true) {
    for (const rel of ["node_modules/eslint/bin/eslint.js", "node_modules/.bin/../eslint/bin/eslint.js"]) {
      const candidate = join(dir, rel);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir || dir === parse(dir).root) return undefined;
    dir = parent;
  }
}

const eslintJs = findEslintJs(dirname(filePath));
if (!eslintJs) process.exit(0);

try {
  execFileSync(process.execPath, [eslintJs, "--no-warn-ignored", filePath], {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
  });
  process.exit(0);
} catch (error) {
  if (error.status !== 1) process.exit(0); // config error / spawn / timeout: not a lint result
  const out = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
  if (!out) process.exit(0);
  console.error(`ESLint found problems in ${filePath} — fix them before continuing:\n${out.slice(0, 8000)}`);
  process.exit(2);
}
