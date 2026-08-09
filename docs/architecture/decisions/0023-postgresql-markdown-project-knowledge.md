# 0023 - PostgreSQL Markdown Project Knowledge

Date: 2026-08-09
Status: Accepted
Supersedes: ADR 0016 for active runtime project knowledge

Implementation: persistence, operator review/search API, task scopes, creation-time typed-link provenance, approved pointer, explicit model-use policy, non-destructive retirement, Opportunity Research material loading, and database lifecycle guards shipped in ADR 0022 Slice 2 on 2026-08-09. Reusable agent-tool retrieval, typed-link traversal, and repository import remain deferred.

## Context

ADR 0016 correctly rejected Markdown as a shadow operational database and deferred an active file-backed context folder. Opportunity Research now has a concrete need for reusable, project-scoped business knowledge: confirmed business facts, field lessons, research handoffs, source notes, and bounded context that can be reviewed once and reused across runs.

The data is small enough for direct relational retrieval. The product does not need embeddings, a vector database, a filesystem database, or Mastra memory to solve this use case.

## Decision

PostgreSQL owns active project knowledge. Markdown is the human-readable body format inside immutable version rows, not the persistence engine.

```text
project_knowledge_documents
  stable project-scoped identity and key

project_knowledge_versions
  immutable versioned Markdown, source provenance, status, digest, actors

project_knowledge_links
  typed relationships between versions

project_knowledge_task_scopes
  closed application task scopes for retrieval
```

Statuses are `proposed | approved | rejected`.

- Agent-authored versions always enter `proposed`.
- Human-authored versions may be created as `approved` only through an actor-bound command with project permission; database triggers independently require same-project owner, admin, or editor authority for creation and owner or admin authority for review/retirement.
- Approval and rejection are compare-and-set transitions on the expected current status.
- Model use is a separate immutable per-version policy: `operator_only | model_allowed`. Approval does not imply model access, and review is compare-and-set bound to the expected policy.
- Approved semantic fields, source identity, and digest are immutable.
- A document may have many historical versions but at most one current approved version.
- Replacing approved knowledge creates a new version; it does not rewrite history.
- Retirement is an actor-authorized compare-and-set command against the exact current approved version. It clears the current pointer and records actor, reason, and timestamp without deleting or rewriting any version; retired documents cannot accept new versions, reviews, reactivation, or pointer changes.

Every version stores a SHA-256 digest over the exact accepted UTF-8 Markdown body. A downstream evidence item separately digests its complete normalized source projection. Source kind/id and optional typed links remain provenance, not customer-safe proof. Database creation guards require the declared source kind to resolve to compatible same-project durable truth; `field_evidence` remains rejected until that source kind has an explicit owner. A knowledge record that cites a ranking proof does not inherit that proof tier automatically; downstream evidence binding resolves the current source rows again.

Production agent material loading requires project scope, the current approved pointer, a non-retired document, `model_use_policy = model_allowed`, and the `opportunity_research` task scope. It orders bounded records deterministically, verifies each Markdown digest, and includes the result inside the workflow's 120,000-byte aggregate evidence-packet cap. Every provider retry reloads and verifies that current material identity immediately before transport, so admission-time approval cannot authorize a later attempt after retirement or policy change. Approved `operator_only` records remain available to authorized operators but cannot enter model context. No vector or embedding index is created.

The operator API exposes read/search/propose/approve/reject/retire operations. Its `simple` full-text search may intentionally include proposed, rejected, superseded, or retired historical versions when the operator asks for those records; it is a review/audit surface, not the agent retrieval boundary. Opportunity Research currently receives current approved, explicitly model-allowed scoped records through the server-owned material resolver rather than a standalone agent-facing knowledge tool. Agents never receive arbitrary SQL or database handles.

Typed links are persisted provenance but are not traversed by the V1 resolver. Exact-key retrieval, link traversal, a reviewed repository-import command, and a reusable agent-facing knowledge tool remain deferred until a concrete workflow needs them. The implementation must not claim those capabilities merely because their relational schema exists.

Repository Markdown remains documentation and source material. It is imported only through an explicit reviewed command. No runtime process recursively reads external field/research folders, hidden rule folders, or arbitrary local paths.

## Consequences

Project knowledge is tenant-scoped, revisioned, queryable, and easy for humans and models to read without adding a second database technology. PostgreSQL constraints can enforce lifecycle, actor, digest, and reference invariants. Search remains deterministic and rebuild-free at the current scale.

The tradeoff is that Markdown rendering and search are application concerns. This is acceptable because V1 returns source text to operator UI and bounded agent packets; it does not publish arbitrary Markdown as HTML.

## Alternatives Considered

### File-Backed Active Context Folder

Rejected for runtime product knowledge. Files remain good authored documentation, but tenant scope, concurrent review, lifecycle CAS, typed links, and agent retrieval are safer in PostgreSQL.

### Vector RAG

Deferred. There is no demonstrated recall or context-size failure that justifies embeddings, chunk lifecycle, vector tenancy, or another retrieval authority. A later ADR may add a rebuildable vector projection over approved versions after measured need.

### Mastra Memory

Rejected as project knowledge authority. Mastra memory is framework operational state and cannot own reviewed business facts or SEO evidence.

## Regression Guard

Future work must not:

- retrieve proposed or rejected knowledge for production agent runs;
- retrieve approved `operator_only`, superseded, or retired knowledge for production model context;
- retry a provider call without reloading current approved, scoped, explicitly model-allowed material identity;
- let an agent approve its own version;
- accept a knowledge creation/review actor or declared source relationship without database-verified same-project authority and source truth;
- mutate approved version content or provenance;
- hard-delete retirement history, clear the current pointer without retirement evidence, or reactivate a retired document;
- treat Markdown text as ranking proof or customer-safe proof by assertion;
- expose arbitrary SQL, filesystem reads, or hidden-folder traversal as a knowledge tool;
- add embeddings/vectors without a measured retrieval problem and a separate accepted decision;
- let Mastra memory or generated indexes replace PostgreSQL knowledge truth.

## Related Files

- `docs/architecture/decisions/0016-markdown-context-records-and-retrieval-boundary.md`
- `docs/architecture/decisions/0022-agentic-runtime-and-evidence-ledger.md`
- `packages/db/src/schema.ts`
- `packages/contracts/src/opportunity-research.ts`
- `apps/api/src/modules/project-context.module.ts`
