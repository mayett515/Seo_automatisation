# Cross-domain invariants

Two tiers. **Product constraints (`P`)** are the author's own rules about what
the product must be; they come from the knowledge pack, which is the original
plan for this product and not a description of what is built. **Technical
invariants (`G`)** are how those constraints are held up in code, and each one
names the constraint it serves.

Domain parents add numbered `D` rules for their own area and never restate
these. Each lane leaf names what it enforces in `enforces`, and its `Is`
section gives the address. An invariant no lane enforces is an intention, and
the guard says so out loud.

The chain is meant to be readable in both directions: from a line of code up to
the reason it exists, and from the product idea down to the place that holds it.

## Product constraints

### P1 — Automation in the background, control in the foreground

The master principle of the product
(`local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/01-PRODUCT-SNAPSHOT.md`).
Work happens automatically; decisions do not.

### P2 — The customer decides what goes live

Preview and approval come before deploy, and the customer can approve, edit,
pause, or reject (`00-AI-INGESTION-GUIDE.md`, absolute constraints).

### P3 — Reports are honest, including when the news is bad

A report may not always show green. Weak signals are stated as warning,
observation, or opportunity. Forecasts may be conservative but never fake
(`00-AI-INGESTION-GUIDE.md`; `product/01-end-to-end-product.md` names
"a system that always shows green fake success" as what the product is not).

### P4 — The product improves the customer's own site

Not mass publishing, not competitor cloning
(`00-AI-INGESTION-GUIDE.md`, absolute constraints).

### P5 — Analytics and session tracking are designed privacy-consciously

(`00-AI-INGESTION-GUIDE.md`, absolute constraints.)

## Technical invariants

### G1 — No customer-facing claim without bound evidence

_Serves P3._ A statement shown to a customer is traceable to persisted evidence
and a verified artifact. Nothing is presented as observed because it was
plausible, and nothing from a stand-in adapter is presented as observed at all.

_Already written in:_ ADR 0021, digest-bound customer report publication.

### G2 — A reported status describes the effect that really happened

_Serves P1 and P3._ `queued`, `completed`, `failed`, `dry_run`,
`not_configured`, `pending` mean what they say. A success-shaped answer is never
returned for work that did not happen, and a failure is never reported for work
already underway.

_Already written in:_ `.claude/rules/nest.md:32`.

### G3 — A proof does not cross a process, queue, or persistence boundary

_Serves P2._ An approval established in memory on one side of a queue is not
established on the other. Beyond the boundary the state is read again and
checked again, and a re-established check proves what was read, never that no
one else is writing concurrently. Without this, "the customer decides what goes
live" holds only until the first race.

_Already written in:_ `apps/api/AGENTS.md:48`.

### G4 — Every public write boundary is authenticated or rate-limited, and audited

_Serves P5 and the integrity of everything above._ A path that reaches
persistence or the job infrastructure from an unauthenticated request carries a
rate limit and leaves an audit trace. The tracking ingestion boundary is the
reference implementation.

_Enforced outside the lanes:_ apps/api/src/modules/tracking.module.ts - the tracking ingestion boundary carries the rate limit, origin binding and project key check

_First written here._ The rule was practiced but never stated, which is how a
public unguarded enqueue survived in `pre-audit` without anyone being able to
name a violated rule.
