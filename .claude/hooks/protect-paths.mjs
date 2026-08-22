#!/usr/bin/env node
/**
 * PreToolUse hook: deterministically block Edit/Write to paths that must
 * never be hand-edited. Unlike a CLAUDE.md instruction, exit code 2 here
 * blocks the tool call regardless of what the model decides.
 *
 * `allowCreate: true` lets a NEW file be created under the pattern while
 * still protecting existing ones — creating the next migration is the
 * prescribed remedy and must stay open.
 *
 * Adjust PROTECTED for the host repository. Note: this guards the file
 * tools; common Bash write routes (redirects, sed -i, mv/cp) into the same
 * paths are covered by guard-bash.mjs.
 */
import { existsSync } from "node:fs";

const PROTECTED = [
  { pattern: /[\\/]migrations[\\/](?!meta[\\/]).+\.(sql|ts)$/i, allowCreate: true, reason: "Applied migrations are append-only. Add a new migration instead." },
  { pattern: /[\\/]migrations[\\/]meta[\\/]/i, allowCreate: false, reason: "Migration metadata is tool-owned. Use drizzle-kit generate." },
  { pattern: /\.generated\.[a-z]+$/i, allowCreate: false, reason: "Generated file. Change the generator or its source, then regenerate." },
  { pattern: /[\\/]drizzle[\\/]meta[\\/]/i, allowCreate: false, reason: "Drizzle metadata is tool-owned. Use drizzle-kit." },
  { pattern: /[\\/]\.ai-rules[\\/]/i, allowCreate: false, reason: "Frozen reference bundle (see FROZEN.md). The live rules are .claude/rules/." },
  { pattern: /[\\/]archive[\\/]/i, allowCreate: false, reason: "archive/ is read-only history (including the ledger); new lessons go into the native layer." },
  { pattern: /pnpm-lock\.yaml$/i, allowCreate: false, reason: "Lockfile is tool-owned. Use pnpm add/remove/update." },
];

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;

let filePath;
try {
  filePath = JSON.parse(input)?.tool_input?.file_path ?? "";
} catch {
  process.exit(0);
}

for (const { pattern, allowCreate, reason } of PROTECTED) {
  if (pattern.test(filePath)) {
    if (allowCreate && !existsSync(filePath)) continue; // new file under the pattern is allowed
    console.error(`Blocked edit to ${filePath}: ${reason}`);
    process.exit(2);
  }
}
process.exit(0);
