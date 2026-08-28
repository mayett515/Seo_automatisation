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

if (input?.tool_name !== "apply_patch") process.exit(0);
const command = input?.tool_input?.command ?? "";
const files = [];

for (const match of command.matchAll(/^\*\*\* (?:Add|Update) File: (.+)$/gm)) {
  const declared = match[1].trim();
  const full = isAbsolute(declared) ? declared : resolve(process.cwd(), declared);
  if (/\.(ts|tsx|mts|cts|js|jsx)$/.test(full) && existsSync(full)) files.push(full);
}

if (files.length === 0) process.exit(0);

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

const failures = [];
for (const file of [...new Set(files)]) {
  const eslint = findEslint(dirname(file));
  if (!eslint) continue;
  try {
    execFileSync(process.execPath, [eslint, "--no-warn-ignored", file], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });
  } catch (error) {
    if (error.status !== 1) continue;
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
    if (output) failures.push(output);
  }
}

if (failures.length > 0) {
  console.error(`ESLint found problems in edited files:\n${failures.join("\n\n").slice(0, 12000)}`);
  process.exit(2);
}
