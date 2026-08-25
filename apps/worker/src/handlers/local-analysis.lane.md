---
lane: local-analysis
domain: opportunity
state: scaffold
enforces: []
missing: ["worker handler", "no producer - nothing enqueues into this queue"]
consumes: []
produces: []
terminal: []
external: []
reason: "Superseded, not merely unbuilt. This is queue Q3 of the original topology, the Competitor plus Opportunity Worker (architecture/04-worker-architecture.md). That work exists and runs, under the names opportunity-scout and opportunity-research. The declaration outlived the design and nothing records the rename."
trigger: "Remove the queue name from the registry, or record why an empty declaration is kept. In the code as it stands, unreachable and unreferenced means it should go."
proof: ""
---

## Is

Nothing. The name is declared, a worker is started for it, and no path in the
API or the worker can produce a job for it.

## Is not

- Not a gap in capability. What the plan asked this queue for is built and
  covered by tests; only the name was left behind.
- Not equivalent to an unbuilt lane, which is why the distinction matters: an
  unbuilt lane is missing work, a superseded one is missing a deletion.
