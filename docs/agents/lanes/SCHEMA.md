# Lane leaf schema

A lane leaf is one markdown file next to the code that owns a queue lane. It
records what the lane is, what state it is in, and what proves it. The map at
`generated-map.md` is derived from these files and is never edited by hand.

This file describes the **shape** of a leaf and — in "What the guard enforces"
below — exactly what the checker (`tools/check-lane-inventory.ts`) verifies.
The two must agree, and the `SCHEMA_FIELD_DRIFT` finding enforces that in both
directions. Domain knowledge belongs in the leaves and in the domain parent,
never here: if this file starts explaining what an opportunity is, something
leaked.

## Where a leaf lives

Next to the handler that owns the lane, as `<handler-name>.lane.md` in
`apps/worker/src/handlers/`. Co-location is deliberate — a leaf beside the code
is edited in the same change, a leaf in a documentation folder is forgotten.

A lane with no handler still gets a leaf, and the missing sibling `.ts` file is
itself the marker. Handler file names do not always match queue names
(`page-proposal.ts` serves `page-generation`), so the `lane` field is what binds
a leaf to the registry, never the filename.

## Fields

```yaml
---
lane: deploy # must match an entry in queueNames (packages/contracts/src/jobs.ts)
domain: release # the domain parent in this folder that owns the lane
state: built # built | partial | scaffold | absent-by-decision
missing: [] # what is missing inside the lane; must be empty when state is built
reason: "" # why it is not built; required unless state is built
trigger: "" # what would change the state; required unless state is built
proof: apps/worker/src/handlers/deploy.integration.ts # required when state is built
---
```

The shape is owned by one schema,
`packages/contracts/src/lane-inventory.ts:LaneLeafSchema` — a discriminated
union on `state`, with every variant strict. The checker parses front matter and
hands the raw object to that schema; an undocumented field, a `built` leaf that
lists missing pieces, or a `scaffold` leaf that claims a proof is rejected
there, not by a rule restated here. The allowed field names are derived from the
same schema as `packages/contracts/src/lane-inventory.ts:laneLeafFieldNames`.

There are no artifact edges. An earlier version carried `consumes`,
`produces`, `terminal` and `external` as free strings and derived a data-flow
graph from them; those names were invented and produced a false model. An
earlier per-lane `enforces` field went the same way: the claims it carried named
no address, so coverage over them proved nothing, and the coverage check and its
allowlist were removed with the field. None of them are replaced here — real
data-dependency edges, if wanted later, are a separate slice with their own
proof.

## States

The `state` field is an author's claim. The checker verifies a narrow part of
it and nothing more; the rest is review judgment.

| State                | What the author asserts                                                               | What the checker verifies                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `built`              | reachable and executable, with a fitting behavioral proof                             | the lane has a registered handler, and `proof` names a path that exists on disk                           |
| `partial`            | executable, with a concrete named functional gap that `missing` describes             | the lane has a registered handler, and `missing` names at least one thing                                 |
| `scaffold`           | not executable and unreachable from every enqueue path                                | the lane has no registered handler and is absent from `apiQueueNames`                                     |
| `absent-by-decision` | deliberately not built, with a recorded decision and a recorded trigger to revisit it | the lane has no registered handler and is absent from `apiQueueNames`; `reason` and `trigger` are present |

Nothing in the right-hand column establishes that a lane works. A registered
handler can still fail on every job, and a proof file that exists can still
prove the wrong thing.

Missing test evidence alone is not a functional gap: a lane that runs and is
reachable but lacks a test is a verification gap, not `partial`.

## The facts the guard reads

Each fact is named for what its source proves, and for nothing more.

| Fact                         | Source                                                                    | What it establishes                                                             |
| ---------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `lanesWithRegisteredHandler` | `apps/worker/src/lane-handler-registration.ts:lanesWithRegisteredHandler` | the lane has a handler in the dispatch registry — not that the handler succeeds |
| `reachableFromHttp`          | `packages/contracts/src/jobs.ts:apiQueueNames`                            | the API may enqueue into the lane — not that any request does, and HTTP only    |
| proof existence              | the file system                                                           | the cited path is a file — not that its contents prove anything                 |

`lanesWithRegisteredHandler` is trustworthy because it is not a description of
the dispatch table but its type source:
`apps/worker/src/handler-registry.ts:createHandlerRegistry` derives its return
type from that list, so a lane in the list without a handler, or a handler on a
lane not in the list, is a compile error.
`apps/worker/src/handlers.ts:routeJob` dispatches by indexing that registry and
nothing else.

## Prose sections

Optional, and unchecked. A leaf may carry `## Is not` to name the decisions
this lane must **not** make, each pointing at the lane or code that does make
them - the confusion a reader would otherwise invent for themselves.

This section used to be mandatory, and the schema described a contract the
guard did not implement: an address per rule, "two sections and nothing else".
An audit found every leaf carrying claims with no address, all green. Rather
than demand addresses that in many cases do not exist - `G2`, "a reported
status describes the effect that really happened", is a property of how code
is written, not a symbol anyone can point at - the requirement was dropped.

What that leaves is honest: front matter carries what is bound and checked;
prose is a reader aid, and where it happens to cite an address, the address
findings below validate that the address resolves. Nothing here is claimed as
enforcement.

### Addresses

`path:line` references are banned: a line number drifts the moment a file is
edited. Cite `path + exported symbol` or `path + named database mechanism`
instead. Where a fact lives on an anonymous inline statement or a class method
that is not a top-level export, cite the nearest **exported** owner (class or
function) and put the mechanism name in prose.

Address validation is existence-only and deliberately bounded. It proves the
cited path exists and, for the symbol form, that `name` appears as an exported
symbol in that file. It never proves the symbol means what the prose claims —
that stays a review judgment. The registry-reading regex ban does not apply
here: registries are read by import, while addresses are checked by a bounded
`export … <name>` search.

## What the guard enforces

Every finding carries a stable code. Messages state the fact that fired the
finding; why a lane is in the state it is in lives in that leaf's `reason`
field, never in a message.

- `LANE_LEAF_MISSING` — a `queueNames` entry has no leaf. The registry is read
  by import from the code-owned `queueNames`, never parsed from source.
- `LANE_LEAF_DUPLICATE` — two or more leaves claim the same lane.
- `LEAF_LANE_UNKNOWN` — a leaf names a lane that `queueNames` does not declare.
- `LEAF_SHAPE_INVALID` — front matter is missing, or the leaf does not satisfy
  `LaneLeafSchema`. This is where state-specific field rules live: a `built`
  leaf with a non-empty `missing` or an empty `proof`, a `partial` leaf with
  nothing named as missing, a non-`built` leaf without `reason` and `trigger`,
  a `scaffold` leaf that claims a proof, and any undocumented field.
- `LEAF_DOMAIN_PARENT_MISSING` — the `domain` names no parent file in this
  folder.
- `LANE_PROOF_FILE_MISSING` — a `built` leaf's `proof` path is not a file on
  disk.
- `LANE_HANDLER_MISSING` — a `built` or `partial` leaf against a lane the
  dispatch registry has no handler for.
- `LANE_HANDLER_UNEXPECTED` — a `scaffold` or `absent-by-decision` leaf against
  a lane the dispatch registry does have a handler for.
- `LANE_HTTP_REACHABILITY_CONTRADICTION` — a `scaffold` or `absent-by-decision`
  leaf claims the lane does not run, and `apiQueueNames` admits it, so the API
  may enqueue into it. The predicate says nothing about handlers: a lane that is
  both registered and claimed non-running also produces
  `LANE_HANDLER_UNEXPECTED`, and both findings are collected.
- `API_QUEUE_NOT_IN_REGISTRY` — `apiQueueNames` admitting a name `queueNames`
  does not declare. This is registry incoherence, not a reachability
  contradiction, so it carries its own code: a finding is named by what its
  source proves.
- `MECHANISM_ADDRESS_MISSING` — a line opening with the `_Mechanised at:_`
  marker that names no address. The marker says a rule is held by code that is
  not a lane; without an address it is the phrase alone doing the work, which is
  how the removed artifact edges stayed green. A parent may state a rule with no
  mechanism at all - that is honest - but it may not claim one without saying
  where.
- `ADDRESS_PATH_MISSING` — a cited path does not exist.
- `ADDRESS_SYMBOL_MISSING` — a `path:symbol` citation targets a symbol that is
  not exported from that file.
- `SCHEMA_FIELD_DRIFT` — the field names documented in the example block above
  and the field names the schema validates disagree, in either direction.
- `MAP_STALE` — the generated map on disk differs from the map reproduced from
  the leaves. Regenerate with `--write`.

Every finding is collected; the checker never stops at the first.

`LANE_HTTP_REACHABILITY_CONTRADICTION` is the one that would have caught the
`pre-audit` defect before three separate reviews had to find it by tracing
execution. `MECHANISM_ADDRESS_MISSING` is the one that keeps a mechanisation
claim from being satisfied by its own phrasing.

There is no coverage check over invariants and no allowlist. A parent states its
rules; where a rule has a mechanical owner it says so with an address, and where
it does not, the rule stands as policy rather than as a claim about the code.

## Known epistemic limits

These are not gaps to be closed quietly; they bound what any output of this
system may be described as proving.

- **Reachability covers HTTP only.** Worker-internal producers exist and are
  known — `apps/worker/src/work-recovery.ts`,
  `apps/worker/src/opportunity-research-scheduler.ts` and
  `apps/worker/src/media-storage-cleanup.ts` all enqueue — and none of them is
  covered by `reachableFromHttp`. A future producer registry would only count if
  producers actually enqueue through it; a list maintained beside them is not
  authoritative, because nothing forces a new producer to appear in it.
- **A registered handler is not a working lane.** Membership in
  `lanesWithRegisteredHandler` establishes that dispatch finds a function. It
  says nothing about whether that function completes, persists, or is correct.
- **Proof existence is not proof adequacy.** A `built` leaf's `proof` is checked
  for being a file on disk. Whether the file contains a fitting behavioral test,
  whether that test passes, and whether it exercises the lane at all are outside
  the check. A structured proof contract (naming the kind of proof and the
  behavior it covers) would strengthen the evidence, and would still not
  establish semantic fitness.
- **Shape is not meaning.** `LaneLeafSchema` rejects a leaf that contradicts
  itself structurally. It cannot tell whether the `reason` is true or the
  `trigger` is the right one.
- **The decomposition is judgment.** Whether these lanes are the right lanes is
  reviewable — the leaves are short and uniform, so a reviewer reads the domain
  parent plus its children and asks whether they hold together — but it is never
  a gate.

What the checker establishes is structural consistency between the leaves, the
code-owned registries, and the generated map. It never establishes complete
truth about runtime behavior, and no output of this system should be described
as if it did. The generated map is a review starting point, not unquestionable
truth.

## Parents

`ROOT.md` holds the cross-domain invariants, numbered `G1`, `G2`, … Each domain
parent is one file named after the domain, and holds two things in this order:

1. **What it is for** — three to five sentences. This is the domain's share of
   the product intent, and it lives here rather than in a separate document so
   that a domain's purpose cannot drift away from its own rules.
2. **Invariants**, numbered `D1`, `D2`, … Each one sentence of rule plus, where
   useful, why it takes that form here and where it is enforced.

Parents state rules; leaves give addresses and record deviations. A leaf that
restates its parent's rule in its own words has copied it, and copies decay.

Every invariant should identify both why it exists (Product Pack, deployment
extension, accepted ADR, or a current project rule) and where it is enforced
(contract, exported function, guard, database mechanism, or a fitting
behavioral test). An invariant with no enforcement owner and no reason is an
open item and is never described as enforced.

The product-wide intent — what the whole thing is for — stays in one document,
`docs/architecture/app-blueprint.md`. Splitting it per domain would produce
several partial pictures that can contradict each other without anyone noticing.

## Adding a second kind of node

Split by kind, not by size. When routes or modules get leaves, they get
`SCHEMA-route.md` and `SCHEMA-module.md` beside this file, each one page with
its own field set. A schema that no longer fits on a page means a field is
doing too much, not that the file needs parts.
