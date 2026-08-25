# Lane leaf schema

A lane leaf is one markdown file next to the code that owns a queue lane. It
records what the lane is, what state it is in, and what proves it. The map at
`generated-map.md` is derived from these files and is never edited by hand.

This file describes the **shape** of a leaf. Domain knowledge belongs in the
leaves and in the domain parent, never here: if this file starts explaining
what an opportunity is, something leaked.

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
enforces: [G2, D1] # invariants from ROOT.md (G) and the domain parent (D)
missing: [] # what is missing inside the lane; must be empty when state is built
consumes: [approved-release-plan] # artifacts this lane reads
produces: [deployment] # artifacts this lane writes
terminal: [] # produced artifacts consumed outside the lanes, not by another lane
external: [] # consumed artifacts that originate outside the lanes: a human, the API, a customer site
reason: "" # why it is not built; required unless state is built
trigger: "" # what would change the state; required unless state is built
proof: apps/worker/src/handlers/deploy.integration.ts # required when state is built
---
```

`consumes` and `produces` are the edges. The flow is derived from them, so no
graph is maintained anywhere — the edges live on the nodes and the map is
generated. Artifact names are free strings but must match across lanes; a typo
surfaces as a dangling edge.

## States

| State                | Meaning                                                                    |
| -------------------- | -------------------------------------------------------------------------- |
| `built`              | The lane runs and something proves it. `proof` must name a real file.      |
| `partial`            | The lane runs, but something inside is incomplete. `missing` says what.    |
| `scaffold`           | Registered but cannot run. Must not be reachable from an API enqueue path. |
| `absent-by-decision` | Deliberately not built. `reason` and `trigger` carry the decision.         |

## Prose sections

Below the front matter, two sections and nothing else. Both carry **domain
rules**, not a description of the mechanism. What the code does is already in
the code, and a prose copy of it decays; what the code does not say is which
business decision this lane owns.

- **`## Is`** — the rules this lane enforces, in the vocabulary of `CONTEXT.md`.
  Each rule names the place that enforces it as `path:line`. A rule without an
  address is a wish, not a mechanism, and being unable to find one is itself a
  finding worth recording in `missing`.
- **`## Is not`** — the decisions this lane must **not** make, each naming the
  lane or the code that does make them. This is where a reader's likely
  confusion gets named before they invent it.

The test for a good `Is` line: could a reader derive it by reading the handler?
If yes, it is mechanism and does not belong here. If no, it is domain logic and
this is the only place it lives.

## What the guard enforces

1. Every `queueNames` entry has exactly one leaf, and every leaf names a real
   `queueNames` entry.
2. `state` other than `built` requires `reason` and `trigger`.
3. `state: built` requires a `proof` path that exists on disk, and an empty
   `missing`.
4. Every consumed artifact is produced by some lane or listed in that lane's
   `external`. Lanes are fed by people and by the API as well as by each other,
   so a closed graph would be a false model.
5. Every produced artifact is consumed by some lane or listed in that lane's
   `terminal`.
6. A `scaffold` or `absent-by-decision` lane must not appear in `ApiQueueName`
   (`apps/api/src/queue-producer.ts`). A lane that cannot run must not be
   reachable from an HTTP request.
7. Every id in `enforces` exists in `ROOT.md` or in the named domain parent.
8. Every invariant in `ROOT.md` and in every domain parent is either named in
   some lane's `enforces`, or carries an `_Enforced outside the lanes:_` line
   with an address. A rule may well be held by a controller boundary, a
   contract default, or a pure function; what it may not be is held by nobody.
   A rule nobody enforces is an intention, and this is the check that says so.
9. Every `domain` names a parent file that exists in this folder.
10. The field names documented above are exactly the field names the guard
    validates, in both directions, so this description cannot drift from the
    check.

Check 6 is the one that would have caught the `pre-audit` defect before three
separate reviews had to find it by tracing execution. Check 8 is the one that
answers whether the children together cover what the parent claims.

## What the guard cannot enforce

Whether the decomposition into these lanes is the right decomposition, and
whether an artifact means the same thing to its producer and its consumer.
That is judgment. It is reviewable — the leaves are short and uniform, so a
reviewer reads the domain parent plus its children and asks whether they hold
together — but it is never a gate, and no output of this system should be
described as proving it.

## Parents

`ROOT.md` holds the cross-domain invariants, numbered `G1`, `G2`, … Each domain
parent is one file named after the domain, and holds two things in this order:

1. **What it is for** — three to five sentences. This is the domain's share of
   the product intent, and it lives here rather than in a separate document so
   that a domain's purpose cannot drift away from its own rules.
2. **Invariants**, numbered `D1`, `D2`, … Each one sentence of rule plus, where
   useful, why it takes that form here.

Parents state rules; leaves give addresses and record deviations. A leaf that
restates its parent's rule in its own words has copied it, and copies decay.

The product-wide intent — what the whole thing is for — stays in one document,
`docs/architecture/app-blueprint.md`. Splitting it per domain would produce
several partial pictures that can contradict each other without anyone noticing.

## Adding a second kind of node

Split by kind, not by size. When routes or modules get leaves, they get
`SCHEMA-route.md` and `SCHEMA-module.md` beside this file, each one page with
its own field set. A schema that no longer fits on a page means a field is
doing too much, not that the file needs parts.
