#!/usr/bin/env node
// Reasonix sends a different payload shape than Claude Code:
//   {"event":"PreToolUse","toolName":"bash","toolArgs":{"command":"..."}}
// against Claude's {"tool_name":"Bash","tool_input":{"command":"..."}}.
//
// The policy itself is not duplicated here. Wiring the Claude scripts in
// directly would have been worse than leaving Reasonix unguarded: they read
// `tool_name`, would have found nothing, exited 0, and allowed everything -
// a hook that looks installed and enforces nothing. This adapter translates the
// payload and delegates, so the two hosts share one policy and it cannot drift.
//
// Usage: node claude-policy-adapter.mjs <path-to-claude-hook.mjs>
import { spawnSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";

const target = process.argv[2];
if (target === undefined) {
  console.error("claude-policy-adapter: missing target hook path");
  process.exit(1);
}

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;
raw = raw.replace(/^﻿+/, "");

let input;
try {
  input = JSON.parse(raw);
} catch {
  // An unreadable payload is not a policy violation; the host decides.
  process.exit(0);
}

// Both the tool name and its argument keys differ, and both were established by
// probing a real run rather than assumed. Probed 2026-08-26 against Reasonix:
//   bash       :: command
//   write_file :: path, content
//   read_file  :: path
// Getting either wrong is silent: the target script finds no field it knows,
// exits 0, and every call is allowed while `reasonix hook list` still reports
// the hook as active. That happened twice while writing this.
// `absolutise` is the third layer, and it cost a real bypass to find. Reasonix
// passes a repo-relative path (`archive/note.md`); Claude Code passes an
// absolute one. Patterns anchored on a leading separator - `[\\/]archive[\\/]`
// - match the absolute form and miss the relative one, so a protected write
// went through while the hook ran, matched, and reported success.
const TOOLS = {
  bash: { claudeName: "Bash", renameArgs: {}, absolutise: [] },
  write_file: {
    claudeName: "Write",
    renameArgs: { path: "file_path" },
    absolutise: ["file_path"]
  }
};

const toolName = typeof input?.toolName === "string" ? input.toolName : "";
const mapping = TOOLS[toolName];
if (mapping === undefined) {
  // A tool this adapter does not translate carries no policy here. Allowing it
  // is the honest answer; pretending to check it would not be.
  process.exit(0);
}

const cwd = typeof input?.cwd === "string" && input.cwd !== "" ? input.cwd : process.cwd();

const args = { ...(input?.toolArgs ?? {}) };
for (const [from, to] of Object.entries(mapping.renameArgs)) {
  if (from in args) {
    args[to] = args[from];
  }
}
for (const key of mapping.absolutise) {
  const value = args[key];
  if (typeof value === "string" && value !== "" && !isAbsolute(value)) {
    args[key] = resolve(cwd, value);
  }
}

const translated = JSON.stringify({
  tool_name: mapping.claudeName,
  tool_input: args,
  hook_event_name: input?.event ?? "",
  cwd: input?.cwd ?? process.cwd()
});

const result = spawnSync(process.execPath, [target], {
  input: translated,
  encoding: "utf8"
});

if (result.error) {
  console.error(`claude-policy-adapter: could not run ${target}: ${result.error.message}`);
  process.exit(1);
}

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 0);
