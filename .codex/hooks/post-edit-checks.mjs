#!/usr/bin/env node
/**
 * PostToolUse hook, Codex dialect. Codex is the one host that does not hand
 * over an edited path at all: `apply_patch` carries a patch command, and the
 * files it touches are named on its `*** Add File:` / `*** Update File:` lines.
 * Parsing those is the whole difference; everything else lives in the shared
 * body.
 *
 * Deletions are deliberately included. Removing a lane leaf is exactly the edit
 * that leaves a queue lane undocumented, and a hook that only watched additions
 * would stay quiet for it.
 */
import { isAbsolute, resolve } from "node:path";

import { readPayload, reportAndExit } from "../../tools/agent-hooks/after-edit.mjs";

const payload = await readPayload();
if (!payload) process.exit(0);
if (payload?.tool_name !== "apply_patch") process.exit(0);

const command = payload?.tool_input?.command ?? "";
const paths = [];

for (const match of command.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gmu)) {
  const declared = (match[1] ?? "").trim();
  if (declared === "") continue;
  paths.push(isAbsolute(declared) ? declared : resolve(process.cwd(), declared));
}

reportAndExit(paths);
