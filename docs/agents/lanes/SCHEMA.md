# Lane leaf schema

A lane leaf is one markdown file next to the code that owns a queue lane. It
records what the lane is, what state it is in, and what proves it. The map at
`generated-map.md` is derived from these files and is never edited by hand.

This file describes the **shape** of a leaf and — in "What the guard enforces"
below — exactly what the checker (`tools/check-lane-inventory.ts`) verifies.
The two must agree, and check 10 enforces that. Domain knowledge belongs in the
leaves and in the domain parent, never here: if this file starts explaining what
an opportunity is, something leaked.

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

There are no artifact edges. An earlier version carried `consumes`,
`produces`, `terminal` and `external` as free strings and derived a data-flow
graph from them; those names were invented and produced a false model. They are
removed and not replaced here — real data-dependency edges, if wanted later,
are a separate slice with their own proof.

## States

| State                | Meaning                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `built`              | reachable and executable, with a fitting behavioral proof. `proof` must name a real file.                     |
| `partial`            | executable, with a concrete named functional gap. `missing` says what.                                        |
| `scaffold`           | not executable and unreachable from every enqueue path.                                                       |
| `absent-by-decision` | deliberately not built, with a recorded decision (`reason`) and a recorded trigger to revisit it (`trigger`). |

Missing test evidence alone is not a functional gap: a lane that runs and is
reachable but lacks a test is a verification gap, not `partial`.

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
prose is a reader aid, and where it happens to cite an address, check 12
validates that the address resolves. Nothing here is claimed as enforcement.

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

1. Every `queueNames` entry has exactly one leaf, and every leaf names a real
   `queueNames` entry. The registry is read by import from the code-owned
   `queueNames`, never parsed from source.
2. `state` other than `built` requires `reason` and `trigger`.
3. `state: built` requires a `proof` path that exists on disk, and an empty
   `missing`.
4. (removed — free-string artifact edges no longer exist)
5. (removed — free-string artifact edges no longer exist)
6. A `scaffold` or `absent-by-decision` lane must not appear in the
   `apiQueueNames` runtime set (`packages/contracts/src/jobs.ts`, imported by
   the checker). A lane that cannot run must not be reachable from an HTTP
   request.
7. A `_Mechanised at:_` line in a parent carries an address. The marker says
   a rule is held by code that is not a lane; without an address it is the
   phrase alone doing the work, which is how the removed artifact edges stayed
   green. A parent may state a rule with no mechanism at all - that is honest -
   but it may not claim one without saying where.
8. (removed — per-lane `enforces` claims were unbound, so coverage over them
   proved nothing)
9. Every `domain` names a parent file that exists in this folder.
10. The field names documented above are exactly the field names the guard
    validates, in both directions, so this description cannot drift from the
    check.
11. The generated map is reproduced exactly from the leaves; a hand-edited or
    drifted map fails until regenerated with `--write`.
12. Every cited address resolves: the path exists, and a `path:symbol` citation
    targets an exported symbol in that file.

Check 6 is the one that would have caught the `pre-audit` defect before three
separate reviews had to find it by tracing execution. Check 7 is the one that
keeps a mechanisation claim from being satisfied by its own phrasing.

There is no coverage check over invariants and no allowlist. Both existed while
leaves carried an `enforces` field, and both were removed with it: coverage over
claims that named no address proved nothing. A parent states its rules; where a
rule has a mechanical owner it says so with an address, and where it does not,
the rule stands as policy rather than as a claim about the code.

## What the guard cannot enforce

Whether the decomposition into these lanes is the right decomposition. That is
judgment. It is reviewable — the leaves are short and uniform, so a reviewer
reads the domain parent plus its children and asks whether they hold together —
but it is never a gate, and no output of this system should be described as
proving it. The generated map is a review starting point, not unquestionable
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
