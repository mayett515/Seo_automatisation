---
description: "Optional Drizzle-first data access extension with Prisma compatibility rules"
globs: "**/*.{ts,tsx,js,jsx,mts,cts,sql,prisma}"
alwaysApply: false
version: "3.4.0-optional-audited"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies: ["optional: drizzle-orm", "optional: prisma"]
priority_schema: "critical > strong > guideline"
---

# Data Access Extension: Drizzle-First, Prisma-Compatible

<meta-instruction>
Use this file when choosing or reviewing ORM/data-access shape. The schema preference is Drizzle-first for greenfield projects, while preserving Prisma when a repo already uses Prisma as its source of truth.
</meta-instruction>

## Directives

<positive-directives>
- Prefer Drizzle for greenfield TypeScript apps when you want SQL-like queries, schema-in-TypeScript, lightweight integration, and project structure that remains yours.
- Preserve Prisma in existing Prisma repos when `schema.prisma`, generated Prisma Client, migrations, and team workflows already own the data model.
- Treat the ORM schema as a persistence boundary, not the entire domain model.
- Map database rows into domain decisions when persistence shape differs from business meaning.
- Keep transactions in the procedural shell or repository boundary, and keep business eligibility decisions in pure functions.
- Use Zod/Valibot/etc. at external input boundaries, not as a replacement for database constraints or migrations.
</positive-directives>

## Constraints

<absolute-constraints>
- DO NOT support both Drizzle and Prisma in the same feature unless migrating or bridging intentionally.
- DO NOT handwrite duplicate model types that drift from ORM-generated or ORM-inferred types.
- DO NOT let ORM query code become the place where business policy is hidden.
- DO NOT hide SQL performance decisions behind generic repository abstractions that remove useful query visibility.
- DO NOT treat database nullability as the same thing as domain optionality.
- DO NOT choose Prisma or Drizzle because of fashion; choose based on source of truth, migrations, query clarity, and team convention.
</absolute-constraints>

## Choice Rule

<context>
```txt
Greenfield / SQL-fluent / lightweight / schema in TS / explicit queries:
  choose Drizzle first.

Existing Prisma repo / generated Prisma Client owns the model / team already has Prisma migrations:
  keep Prisma.

Migration:
  document one current source of truth, one target source of truth, and a drift-check plan.
```
</context>

## Examples

<context>
<example>
// Good: persistence type stays at the boundary.
async function findUserForCheckout(userId: UserId): Promise<UserForCheckout | null> {
  const row = await db.query.users.findFirst({ where: eq(users.id, userId) });
  return row ? toUserForCheckout(row) : null;
}
</example>

<example>
// Bad: ORM row type leaks into every domain decision.
function decideCheckout(user: typeof users.$inferSelect, cart: Cart): CheckoutDecision {
  // business policy now depends on persistence shape
}
</example>
</context>

<pre-flight-checklist>
1. [ ] Is this greenfield or an existing ORM convention?
2. [ ] What is the persistence source of truth?
3. [ ] Did I keep domain policy out of ORM query code?
</pre-flight-checklist>
