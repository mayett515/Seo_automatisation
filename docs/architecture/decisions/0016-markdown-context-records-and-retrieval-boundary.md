# 0016 - Markdown Context Records And Retrieval Boundary

Date: 2026-07-06
Status: Accepted

## Context

The Big Eater context-db research pass reviewed the current Local SEO repo, field SEO folders, schema-factory rules, and external context-memory patterns such as AGENTS.db, OpenViking, and agency-agents.

The useful finding is that the project already has many durable Markdown knowledge sources:

- field SEO workflow retrospectives,
- future growth and keyword maps,
- unused-potential notes,
- Big Eater research handoffs,
- architecture docs and ADRs,
- project rules and anti-regression lessons.

Those documents are valuable for future agents, prompt tuning, page-brief drafting, and local SEO reasoning. They should not become a second application database.

Current operational truth already lives in Postgres:

- `agent_runs`
- `opportunities`
- `ranking_proofs`
- `serp_snapshots`
- `technical_audit_runs`
- `technical_audit_findings`
- `job_runs`
- release/deployment/verification tables

## Decision

Postgres remains the source of operational product truth.

Markdown may be used later as a schema-backed context-record layer for durable human-readable project memory, field evidence summaries, reusable SEO lessons, research findings, and agent handoffs.

The boundary is:

```text
Postgres = app truth, mutable state, ledgers, proof review, queue/run status
Markdown context records = durable project memory and reusable lessons
Generated index/vector store = derived, rebuildable search aid
```

No `.ai-context-db`, `context-db`, or generated retrieval/index folder is created by this ADR. Per planner rules, a new hidden context-record folder requires an approved blueprint before file generation.

If implemented later, the context-record layer should start small:

```text
schemas/
  knowledge-record schema
  record kinds
  promotion policy

base/
  human-reviewed canonical records

delta/
  agent-proposed records awaiting review

local/
  gitignored scratch notes

index/
  generated, rebuildable search metadata
```

Agents may write proposed records only to `delta` or local scratch. Human review promotes records to canonical `base`.

## Consequences

This gives future RAG/agent-memory work a safer path:

- normalize field lessons before retrieval,
- keep provenance and source refs,
- avoid rereading large external folders every session,
- allow generated indexes later without making them authoritative.

It also prevents a common failure mode: turning Markdown into a shadow database for product state.

The first implementation, when approved, should be docs-first and tooling-light:

1. Define the record schema and promotion policy.
2. Convert a few existing field/research documents into proposed records.
3. Generate a simple `records.json` index only after the record shape is stable.
4. Add validation later if the records become active retrieval input.

## Alternatives Considered

### Use AGENTS.db Or OpenViking Directly

Rejected for now. Their trust-layer, provenance, tiered loading, and promotion ideas are useful, but the Local SEO project does not need a binary context database, server runtime, or external memory framework before the evidence/proposal workflow is stable.

### Put Context Records In `.ai-rules`

Rejected. `.ai-rules` is the frozen TypeScript implementation schema. Local SEO product memory belongs in project docs, `.ai-project-rules`, or a future approved context-record folder.

### Put Operational State In Markdown

Rejected. Queue status, proof review state, deployment state, GSC rows, audit findings, opportunities, approvals, OAuth/token state, and tracking events remain database-owned.

### Build Vector RAG Immediately

Rejected. The direct evidence-packet workflow is working. Retrieval should wait until the roadmap triggers are real: packet size, page-brief memory, report narrative retrieval, evidence-explanation UI, or repeated token waste.

## Regression Guard

Future work must not:

- store operational product truth in Markdown,
- let generated indexes become authoritative,
- create `.ai-context-db` or another hidden active folder without an approved blueprint,
- let agents silently promote their own records to canonical truth,
- copy raw customer data, secrets, OAuth material, or large customer documents into context records,
- use Markdown context records as customer-safe proof unless they point to project-owned proof rows and QA still resolves those rows.

## Related Files

- `docs/architecture/agent-first-mvp-roadmap.md`
- `.ai-project-rules/01-product-source-of-truth.md`
- `.ai-planning-rules/00-system-index.md`
- `.ai-planning-rules/01-planner-mode.md`
- `docs/progress/2026-07-06.md`
- `C:/big eater/markdown-context-db-strategy-local-seo-2026-07-06.md`
