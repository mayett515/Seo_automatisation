# Release domain

## What it is for

A human decides that a version should go out. From that moment nobody should
have to decide again: the machine executes the commitment, checks afterwards
whether the site is actually healthy, and says honestly what really happened.
The value of this domain is that the human's decision is made once, carried
faithfully across three processes, and never quietly re-interpreted on the way.

Lanes: `deploy`, `rollback`, `release-verification`.

## Invariants

### D1 — An approval is a human commitment, executed but never re-decided

Machinery downstream of an approval may confirm that the commitment still
stands. It may not re-evaluate whether the commitment was correct, and it may
not widen it.

### D2 — Admission and execution compare against the same named state set

Between the API that admits a deploy and the worker that performs it lie an
HTTP boundary, a queue, and a database. Both sides therefore gate on one
shared, named set of states rather than on two hand-written lists. This is G3
made concrete for this domain, and it is why the set has a single owner in
`packages/domain`.

### D3 — One approved plan yields at most one deployment

Concurrency is settled where it can actually be settled: a deterministic job id
plus a serialized enqueue. Admission reads are not the guard, because they are
separate statements and not atomic.

### D4 — A completed deployment is not evidence of live health

Finishing a provider deploy says the provider accepted the work. Whether the
site is live and healthy is a separate claim owned by verification, and no
report may collapse the two.
