# 2026-08-26 - The lane inventory, and the rule it kept breaking

Scope: a queue-lane inventory bound to the code-owned registry, a dispatch
registry replacing the worker's if-chain, and one rule promoted after it caught
defects in the change that introduced it. Merged as `c0293d6` and `188a554`.

## Why

Three review sessions read this repository on 2026-08-25 and produced three
different pictures of what exists. "Which queue lanes exist, and in what state"
had no owner, so each session reconstructed it from code, and reconstruction is
where a reader starts guessing. One of the three then found the defect that
proves the point: `POST /leads/:id/start-pre-audit` enqueued jobs into a queue
with no worker handler and answered `status: "queued"`.

## What exists now

Every entry in `queueNames` has a leaf beside its handler
(`apps/worker/src/handlers/<name>.lane.md`) carrying its state, the concrete gap
inside it, why it is that way, what would change it, and the test that proves
it. Eight domain parents in `docs/agents/lanes/` hold the rules, written from
the product knowledge pack rather than from a reading of the code; `ROOT.md`
separates the author's product constraints (`P1`-`P5`) from the technical
invariants that serve them (`G1`-`G4`). `generated-map.md` is derived from the
leaves and never hand-edited.

The dispatcher is now the registry it describes. `routeJob` resolves the lane,
indexes a `Record` whose type derives from `lanesWithRegisteredHandler`, and
runs the binding it finds - a missing key, a `null` on a lane with a handler, or
a handler on a lane without one is a compile error. The twelve-branch if-chain
and its fallthrough `throw` are gone.

The checker (`tools/check-lane-inventory.ts`, pure core in
`tools/lane-inventory/core.ts`) contradicts leaf claims with facts it owns:
`lanesWithRegisteredHandler`, `reachableFromHttp` (`apiQueueNames`), and proof
file existence. It runs in the `text:check` chain, which CI executes.

## What it caught

- `pre-audit` was reachable from HTTP with no handler. The endpoint now fails
  closed with an honest `dry_run`, the lane is out of `apiQueueNames`, and the
  public pre-sales route is unchanged - no authentication was invented, because
  a lead form is pre-auth by design.
- `local-analysis` and `seo-qa` are superseded rather than unbuilt. In the code
  the two look identical; only a leaf could say which.
- The producer accepted queue name and job name as independent choices, so a
  secondary job on a foreign queue was writable. `secondaryJobLanes` in
  contracts owns the pairing now, and the worker's separate copy is gone.

## The rule this change kept breaking

Two rules were promoted to the pack master this morning and synced here the same
afternoon:

> Name a check or fact by what its source proves, never by what it is hoped to
> mean.

> A documented claim about system state must be comparable against something the
> code owns.

Both came from failures in this repository, and both caught further defects in
the slice that introduced them. Nine instances of the same shape were found and
removed over two days: artifact edges and a per-lane `enforces` field (claims
compared against other claims, green regardless of the code), a mechanisation
marker satisfied by its own phrase, `executableLaneNames` (proved registration,
not executability), a finding message asserting no handler processes a job when
its predicate never looked at handlers, and a binding field documented as
non-callable that a rest parameter made callable.

The lesson worth carrying: none of these failed. Every one was green while
carrying a false statement, which is worse than a visible bug because it buys
trust it has not earned.

## What was verified

Recounted for this entry rather than quoted from the commits:

- `corepack pnpm --filter @localseo/worker test` - 133 of 133 pass.
- `corepack pnpm --filter @localseo/contracts test` - 71 of 71 pass.
- `corepack pnpm exec tsx --test "tools/**/*.test.ts"` - 30 of 30 pass.
- `corepack pnpm exec tsx tools/check-lane-inventory.ts` - passes for 17 lanes,
  12 with a registered handler, over 15 semantic finding codes.
- `corepack pnpm typecheck`, `lint` (0 errors, 2 pre-existing TanStack
  warnings), `format:check`, `text:check` - all pass.
- CI `validate`, `integration` and `browser-smoke` green on both pull requests,
  so the database-backed suites ran there.

Every new mechanism was observed failing before being trusted: the mapping test
by swapping two same-signature handlers, the queue-wins resolution by reversing
`resolveLane`, each contradiction row by its own test, and the compile-time
assertion that all four leaf variants share a field set by adding a field to
one.

## Known limits, stated rather than implied

These are in `docs/agents/lanes/SCHEMA.md` as limits, not omissions:

- Proof existence is not proof adequacy. The checker verifies that a `proof`
  path is a file; whether that file tests the lane stays a review judgment.
- `reachableFromHttp` covers HTTP only. Three worker-internal producers
  (`work-recovery.ts`, `opportunity-research-scheduler.ts`,
  `media-storage-cleanup.ts`) enqueue as well and are outside coverage. A
  producer registry would only count if those modules enqueued through it.
- Three shell-emitted findings (`LEAF_SHAPE_INVALID`,
  `LEAF_DOMAIN_PARENT_MISSING`, `API_QUEUE_NOT_IN_REGISTRY`) have no direct
  boundary test. Named test debt.

## What remains next

- **`main` is unprotected.** Verified through the GitHub API: no branch
  protection, no rulesets. CI runs on every pull request and blocks nothing.
  Making `validate` a required check closes the last link between the checker
  and the merge; `integration` should only be required once it is confirmed to
  appear on every pull request, because a required check that never arrives
  leaves pull requests unmergeable.
- **`pre-audit` is fail-closed but unbuilt.** Building it is a product
  decision; the leaf records what it would take.
- The three test-debt items above.
- Carried from the previous entry: branded identifiers (measured, not
  promoted), a hotspot report over size and change frequency, and a browser
  check for the navigation empty state.
