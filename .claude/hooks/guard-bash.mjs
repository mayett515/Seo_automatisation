#!/usr/bin/env node
/**
 * PreToolUse hook for Bash: block commands that mutate schema/data outside
 * the reviewed migration path, destructive git pushes, and shell write
 * routes into paths that protect-paths.mjs guards for the file tools.
 * Exit 2 blocks the command.
 *
 * Adjust DENIED and PROTECTED_WRITE_TARGETS for the host repository.
 */
const DENIED = [
  { pattern: /\bdrizzle-kit\s+(push|drop)\b/, reason: "Schema changes go through generated migrations (db:generate), never push/drop." },
  { pattern: /\bprisma\s+(db\s+push|migrate\s+reset)\b/, reason: "Schema changes go through migrations; reset destroys data." },
  { pattern: /\b(pnpm|npm|yarn|bun)\b[^\n]*\bdb:push\b/, reason: "Schema changes go through generated migrations, never push." },
  { pattern: /\bgit\s+push\b[^\n]*(\s-f\b|\s--force\b(?!-with-lease)|\s\+\S)/, reason: "Force-push is not allowed; use --force-with-lease after explicit approval." },
];

// Bash write routes into paths the file-tool hook protects.
const PROTECTED_WRITE_TARGETS = /(migrations[\\/][^\s"']*\.(sql|ts)|pnpm-lock\.yaml|\.ai-rules[\\/]|drizzle[\\/]meta[\\/])/i;
const WRITE_ROUTES = /(>>?\s*\S|(\bsed\b[^\n]*\s-i\b)|\btee\b|\bmv\b|\bcp\b|\bgit\s+checkout\b[^\n]*--|\brm\b)/;

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;

let command;
try {
  command = JSON.parse(input)?.tool_input?.command ?? "";
} catch {
  process.exit(0);
}

for (const { pattern, reason } of DENIED) {
  if (pattern.test(command)) {
    console.error(`Blocked command: ${reason}`);
    process.exit(2);
  }
}

if (WRITE_ROUTES.test(command) && PROTECTED_WRITE_TARGETS.test(command)) {
  console.error(
    "Blocked command: it writes into a protected path (migrations / lockfile / frozen bundle / drizzle meta). Use the prescribed tool instead.",
  );
  process.exit(2);
}
process.exit(0);
