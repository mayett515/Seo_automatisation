#!/usr/bin/env node
/**
 * Antigravity (agy) PostToolUse hook: lint the single edited file right after
 * an edit tool ran, so the agent never needs to start (and wait on) its own
 * repo-wide lint. Thin adapter around the same node-direct ESLint approach as
 * .claude/hooks/post-edit-lint.mjs - agy's payload is camelCase with the
 * target under toolCall.args.TargetFile.
 */
import { spawnSync } from "node:child_process";
import { existsSync, appendFileSync } from "node:fs";

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;
raw = raw.replace(/^\uFEFF+/, "");

let filePath = "";
try {
  const input = JSON.parse(raw);
  const args = input?.toolCall?.args ?? {};
  filePath = args.TargetFile ?? args.targetFile ?? args.AbsolutePath ?? "";
  // Probe marker: proves the hook fired even if agy never surfaces our output.
  appendFileSync(
    `${process.env.TEMP ?? "/tmp"}/agy-hook-probe.log`,
    `${new Date().toISOString()} tool=${input?.toolCall?.name ?? "?"} file=${filePath}\n`
  );
} catch {
  process.stdout.write("{}");
  process.exit(0);
}

if (!/\.(ts|tsx|mjs|cjs|js|jsx)$/i.test(filePath) || !existsSync(filePath)) {
  process.stdout.write("{}");
  process.exit(0);
}

const eslintBin = "node_modules/eslint/bin/eslint.js";
if (!existsSync(eslintBin)) {
  process.stdout.write("{}");
  process.exit(0);
}

const result = spawnSync("node", [eslintBin, "--no-warn-ignored", filePath], {
  encoding: "utf8",
  timeout: 60_000
});

if (result.status === 1) {
  const findings = (result.stdout ?? "").trim().slice(0, 2000);
  // Undocumented whether agy surfaces either channel; emit on both.
  process.stdout.write(JSON.stringify({ message: `ESLint findings for ${filePath}:\n${findings}` }));
  console.error(`ESLint findings for ${filePath}:\n${findings}`);
  process.exit(0);
}

process.stdout.write("{}");
process.exit(0);
