#!/usr/bin/env node
/**
 * postToolUse hook, Cursor dialect: the edited file has arrived under three
 * different keys, so accept all three rather than betting on one. Everything
 * else lives in the shared body.
 */
import { readPayload, reportAndExit } from "../../tools/agent-hooks/after-edit.mjs";

const payload = await readPayload();
if (!payload) process.exit(0);

reportAndExit([payload?.file_path ?? payload?.tool_input?.file_path ?? payload?.tool_input?.path]);
