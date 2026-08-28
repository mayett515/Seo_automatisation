#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";

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

const toolName = input?.tool_name ?? "";
const command = input?.tool_input?.command ?? "";

function deny(reason) {
  console.error(reason);
  process.exit(2);
}

if (toolName === "Bash") {
  const denied = [
    [/\bdrizzle-kit\s+(push|drop)\b/i, "Schema changes use reviewed generated migrations, never drizzle-kit push/drop."],
    [/\bprisma\s+(db\s+push|migrate\s+reset)\b/i, "Schema changes use migrations; Prisma push/reset is destructive."],
    [/\b(pnpm|npm|yarn|bun)\b[^\n]*\bdb:push\b/i, "Database schema changes use migrations, never a db:push script."],
    [/\bgit\s+push\b[^\n]*(\s-f\b|\s--force\b(?!-with-lease)|\s\+\S)/i, "Force-push is blocked. Use --force-with-lease only after explicit approval."],
  ];

  for (const [pattern, reason] of denied) if (pattern.test(command)) deny(reason);

  // Defense-in-depth only: a command regex cannot enumerate every write path.
  // The deterministic path guard lives in the apply_patch checks below.
  const writes =
    /(>>?\s*\S|\bsed\b[^\n]*\s-i\b|\btee\b|\bmv\b|\bcp\b|\bgit\s+checkout\b[^\n]*--|\brm\b|\bSet-Content\b|\bAdd-Content\b|\bOut-File\b|\bnode\s+-e\b|\bpython[0-9.]*\s+-c\b)/i;
  const protectedTarget =
    /(migrations[\\/][^\s"']*\.(sql|ts)|pnpm-lock\.yaml|[\\/]?\.ai-rules[\\/]|[\\/]?archive[\\/]|(?:migrations|drizzle)[\\/]meta[\\/])/i;
  if (writes.test(command) && protectedTarget.test(command)) {
    deny("Command writes to a protected migration, lockfile, generated metadata, or frozen legacy-rule path.");
  }
  process.exit(0);
}

if (toolName !== "apply_patch") process.exit(0);

const edits = [];
for (const match of command.matchAll(/^\*\*\* (Add|Update|Delete) File: (.+)$/gm)) {
  edits.push({ operation: match[1], path: match[2].trim() });
}

const protectedPaths = [
  { pattern: /(^|[\\/])\.ai-rules[\\/]/i, reason: "The legacy .ai-rules bundle is frozen reference material." },
  { pattern: /(^|[\\/])archive[\\/]/i, reason: "archive/ is read-only history; new lessons go into the native layer." },
  { pattern: /(^|[\\/])(?:migrations|drizzle)[\\/]meta[\\/]/i, reason: "Migration metadata is tool-owned." },
  { pattern: /\.generated\.[a-z0-9]+$/i, reason: "Generated files change through their source or generator." },
  { pattern: /(^|[\\/])pnpm-lock\.yaml$/i, reason: "The lockfile changes through pnpm." },
];

for (const edit of edits) {
  const resolvedPath = resolve(process.cwd(), edit.path);
  for (const rule of protectedPaths) {
    if (rule.pattern.test(resolvedPath)) deny(`Blocked ${edit.operation.toLowerCase()} of ${edit.path}: ${rule.reason}`);
  }

  if (/(^|[\\/])migrations[\\/].+\.(sql|ts)$/i.test(resolvedPath)) {
    const existing = existsSync(resolvedPath);
    if (edit.operation !== "Add" || existing) {
      deny(`Blocked edit of ${edit.path}: applied migrations are append-only; add a new migration.`);
    }
  }
}
