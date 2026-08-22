#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;
raw = raw.replace(/^\uFEFF+/, "");

let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

// Runs on postToolUse (matcher Write): the documented feedback channel is
// additional_context on stdout. Payload-tolerant reads, silent degradation.
const declared = String(input?.file_path ?? input?.tool_input?.file_path ?? input?.tool_input?.path ?? "");
if (!/\.(ts|tsx|mts|cts|js|jsx)$/.test(declared)) process.exit(0);
const file = isAbsolute(declared) ? declared : resolve(process.cwd(), declared);
if (!existsSync(file)) process.exit(0);

function findEslint(start) {
  let dir = start;
  while (true) {
    const candidate = join(dir, "node_modules", "eslint", "bin", "eslint.js");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir || dir === parse(dir).root) return undefined;
    dir = parent;
  }
}

const eslint = findEslint(dirname(file));
if (!eslint) process.exit(0);

try {
  execFileSync(process.execPath, [eslint, "--no-warn-ignored", file], {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000
  });
} catch (error) {
  if (error.status !== 1) process.exit(0);
  const output = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim().slice(0, 12000);
  if (!output) process.exit(0);
  // postToolUse output schema: additional_context is injected into the
  // conversation after the tool result (per current Cursor hooks docs).
  const message = `ESLint found problems in ${declared} — fix them before continuing:\n${output}`;
  process.stdout.write(`${JSON.stringify({ additional_context: message })}\n`);
  process.exit(0);
}
