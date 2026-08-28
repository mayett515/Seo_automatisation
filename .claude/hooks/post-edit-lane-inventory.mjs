#!/usr/bin/env node
/**
 * PostToolUse hook, Claude Code dialect: the edited file is `tool_input.file_path`.
 * Everything else lives in the shared body.
 */
import { readPayload, reportAndExit } from "../../tools/lane-inventory/after-edit.mjs";

const payload = await readPayload();
if (!payload) process.exit(0); // malformed input: never block the session on hook bugs

reportAndExit([payload?.tool_input?.file_path]);
