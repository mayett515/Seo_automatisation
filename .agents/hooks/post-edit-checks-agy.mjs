#!/usr/bin/env node
/**
 * PostToolUse hook, agy dialect: the edit target sits under `toolCall.args`,
 * with the key varying by which write tool ran. Everything else lives in the
 * shared body.
 */
import { readPayload, reportAndExit } from "../../tools/agent-hooks/after-edit.mjs";

const payload = await readPayload();
if (!payload) process.exit(0);

const args = payload?.toolCall?.args ?? {};

reportAndExit([args.TargetFile ?? args.targetFile ?? args.AbsolutePath]);
