# 2026-08-25 - Rule-layer promotion, mirror parity, and one deploy owner

Scope: the agent rule layer across all four trees, the architecture guard
script, and one source-of-truth fix in the release lane. Follows the review
recorded in [2026-08-25](2026-08-25.md) and the fixes in
[2026-08-25 finding fixes](2026-08-25-finding-fixes.md).

## What changed

Three lessons were promoted into the rule layer. Each came from a concrete
failure in this repository, not from a style preference:

- **The proof matrix** (`CLAUDE.md`, root `AGENTS.md:76`). Typecheck, lint, the
  unit suite and the guards were all green while `PagesService.reviewPageVersion`
  had silently lost `async`; only the integration suite caught it. The rule now
  names which proof fits which kind of change, and states that a cheaper green
  check never substitutes for the fitting one.
- **Guards return the narrowed handle** (`.claude/rules/boundaries.md`,
  `apps/api/AGENTS.md`). Removing five apparently dead `db` branches broke the
  typecheck, because the guard's `if` was also narrowing an optional handle.
- **Unknown keys are a decision** (`.claude/rules/zod-boundaries.md`,
  `packages/contracts/AGENTS.md`). `z.object()` accepts and silently strips
  unknown properties, verified against Zod 4.4.3. Contracts here are strict;
  deviations need a written reason and migrate one contract at a time.

Order of promotion was upstream first: pack master, then the Codex and Cursor
packs, then this repository. The two pack `AGENTS.md` files still differ only in
their three host-specific lines.

The `anti-regression` skill gained a matching step in both trees: audit a
branch for reachability before believing it is dead.

**Mirror parity became a check instead of prose.** The reachability step landed
in `.agents/skills` and not in `.claude/skills`, and every text anchor stayed
green, because an anchor proves a sentence exists somewhere and cannot see two
copies drifting apart. The guard now compares both sorted rule-name sets in each
direction, then the bytes of every pair, then holds a floor on the rule count
(`tools/check-architecture-regression-guards.ts:4926` and `:4957`). All three
branches were proven to fire by reintroducing the drift.

**The deploy-start admission set got one owner.** `deployStartingReleasePlanStatuses`
was declared twice, in the API store and in the worker handler, on opposite ends
of the queue. It now lives in `packages/domain`, which owns lifecycle transitions
and has no IO, so the worker no longer reaches into an API module. Four guard
anchors pin the ownership and both imports.

**How deploy admission actually works is now documented where it is edited**
(`apps/api/AGENTS.md:48`). Admission is not atomic: the capability reads plan,
checks, and approval separately and enqueues afterwards, and its conditional
status update runs after the enqueue. What prevents a double deploy is the
deterministic job id with the advisory-locked enqueue in
`apps/api/src/queue-producer.ts`, plus the worker gating again on the same status
list. This mechanism had been described wrongly three times in one day, which is
why it moved out of a findings file and into the instruction file.

## What was verified

- `corepack pnpm format:check` - pass.
- `corepack pnpm exec tsx tools/check-text-health.ts` - pass. This corrects the
  entry in [2026-08-25](2026-08-25.md), which recorded that the check could not
  start on this host.
- `corepack pnpm exec tsx tools/check-architecture-regression-guards.ts` - pass,
  and each new parity branch separately observed failing before being trusted.
- `corepack pnpm lint` - 0 errors, 2 pre-existing TanStack Table warnings. This
  also corrects [2026-08-25](2026-08-25.md), which recorded five unused
  report-table imports; those are gone.
- `corepack pnpm typecheck` - pass across all workspace packages.
- `corepack pnpm test` - 556 of 556 pass across 11 packages. An earlier
  version of this line read "125 of 125", which is the last package's
  summary rather than the workspace total; the root script runs the
  packages recursively and prints one summary each.
- Worker integration suite against disposable PostgreSQL 17 via
  `TEST_DATABASE_URL` - 155 of 155 pass; `deploy.integration.ts` alone 18 of 18,
  including "does not let deployment ledger start revive a terminal release
  plan", which is the compare-and-set case covering the moved status list.

## What remains next

- **Branded identifiers are measured, not promoted.** 50 signatures in 27
  non-test files take two adjacent identifiers typed as plain strings, and the
  repository defines no branded types. Counting commands and the promotion
  condition are recorded in
  `.ai-stack-findings/2026-08-25-connascence-of-execution.md`. Promote when an
  identifier swap causes a real defect or when the migration is scheduled as its
  own change; a rule written before the migration would be a claim the code does
  not honor.
- A hotspot report over size and change frequency, as a report rather than a
  gate.
- A browser check for the navigation empty state, which no suite currently
  proves.
