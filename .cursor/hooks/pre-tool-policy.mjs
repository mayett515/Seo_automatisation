#!/usr/bin/env node
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;
raw = raw.replace(/^\uFEFF+/, "");

let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(1);
}

function respond(permission, message) {
  const output = { permission };
  if (message) {
    output.user_message = message;
    output.agent_message = message;
  }
  process.stdout.write(`${JSON.stringify(output)}\n`);
  process.exit(0);
}

const toolName = input?.tool_name ?? "";
const toolInput = input?.tool_input ?? {};

if (toolName === "Shell") {
  const command = String(toolInput.command ?? "");
  const denied = [
    [
      /\bdrizzle-kit\s+(push|drop)\b/i,
      "Schema changes use reviewed generated migrations, never drizzle-kit push/drop."
    ],
    [/\bprisma\s+(db\s+push|migrate\s+reset)\b/i, "Schema changes use migrations; Prisma push/reset is destructive."],
    [/\b(pnpm|npm|yarn|bun)\b[^\n]*\bdb:push\b/i, "Database schema changes use migrations, never a db:push script."],
    [
      /\bgit\s+push\b[^\n]*(\s-f\b|\s--force\b(?!-with-lease)|\s\+\S)/i,
      "Force-push is blocked. Use --force-with-lease only after explicit approval."
    ]
  ];
  for (const [pattern, reason] of denied) if (pattern.test(command)) respond("deny", reason);

  // Defense-in-depth only: a command regex cannot enumerate every write path.
  // The guarantees live in the Write/Delete tool checks below.
  const writes =
    /(>>?\s*\S|\bsed\b[^\n]*\s-i\b|\btee\b|\bmv\b|\bcp\b|\bgit\s+checkout\b[^\n]*--|\brm\b|\bSet-Content\b|\bAdd-Content\b|\bOut-File\b|\bnode\s+-e\b|\bpython[0-9.]*\s+-c\b)/i;
  const protectedTarget =
    /(migrations[\\/][^\s"']*\.(sql|ts)|pnpm-lock\.yaml|[\\/]?\.ai-rules[\\/]|[\\/]?archive[\\/]|(?:migrations|drizzle)[\\/]meta[\\/])/i;
  if (writes.test(command) && protectedTarget.test(command)) {
    respond(
      "deny",
      "Command writes to a protected migration, lockfile, generated metadata, or frozen legacy-rule path."
    );
  }
  respond("allow");
}

if (!/^(Write|Delete)$/.test(toolName)) respond("allow");

const declared = String(toolInput.file_path ?? toolInput.path ?? "");
if (!declared) respond("allow");
// Normalize AND resolve so `..` segments cannot dodge the patterns.
const normalized = declared.replaceAll("\\", "/");
const resolvedNorm = resolve(input?.cwd ?? process.cwd(), declared).replaceAll("\\", "/");
const candidates = [normalized, resolvedNorm];

const protectedPaths = [
  [/(^|\/)\.ai-rules\//i, "The retired .ai-rules bundle is frozen reference material."],
  [/(^|\/)archive\//i, "archive/ is read-only history (including the ledger); new lessons go into the native layer."],
  [/(^|\/)(?:migrations|drizzle)\/meta\//i, "Migration metadata is tool-owned."],
  [/\.generated\.[a-z0-9]+$/i, "Generated files change through their source or generator."],
  [/(^|\/)pnpm-lock\.yaml$/i, "The lockfile changes through pnpm."]
];

for (const [pattern, reason] of protectedPaths) {
  if (candidates.some((c) => pattern.test(c))) respond("deny", `${declared}: ${reason}`);
}

if (candidates.some((c) => /(^|\/)migrations\/.+\.(sql|ts)$/i.test(c))) {
  const full = isAbsolute(declared) ? declared : resolve(input?.cwd ?? process.cwd(), declared);
  if (toolName === "Delete" || existsSync(full)) {
    respond("deny", `${declared}: applied migrations are append-only; add a new migration.`);
  }
}

respond("allow");
