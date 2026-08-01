# Finding: Customer Report Publication And Typed Next Action

Date: 2026-08-01

Source synthesis: `C:\big eater\report-next-action-pattern-mining-2026-08-01\2026-08-01-report-next-action-pattern-mining.md`

License: No external code copied. Repository patterns were inspected and adapted as architecture guidance only.

## What We Needed

The Report and Next Action milestone needed a durable answer to five coupled questions:

- what exactly becomes historical customer-report truth;
- how every claim retains project-scoped evidence and provenance;
- how AI can improve prose without becoming factual or publication authority;
- how one reviewed report is published and corrected without silent mutation;
- how a report may propose a next step without bypassing existing product gates.

The existing `reports` table, route placeholder, `report_narrative` vocabulary, and safety scan are scaffolding. They do not answer those questions.

## Sources Inspected

The full synthesis records concrete files, tests, pinned revisions, license notes, rejected patterns, race timelines, and source caveats for:

- Metabase `6fcdf94` - whole-snapshot revision history; AGPL/commercial split.
- DataHub `f3d1682` - provenance separation and deterministic locking; Apache-2.0.
- OSCAL Compass Compliance Trestle `73113ee` - claims/evidence linking and canonical JSON; Apache-2.0.
- Payload `47b8d83` - full version snapshots and draft isolation; MIT.
- Directus `b1d7a45` - expected-hash promotion precheck; source-available MSCL, used only as an observation.
- Documenso `6ec67d1` - terminal artifact pointer plus actor audit; AGPL-3.0.
- Carbone `1df45b5` - complete render manifests and bounded conversion; source-available, used only as an observation.
- HumanLayer `99abe67` - frozen pending action and one terminal human decision; Apache-2.0.
- Mastra `cc85af2` - typed orchestration pause/resume, explicitly not product authority; Apache-2.0 outside enterprise code.
- Trigger.dev `14824b0` - scoped database idempotency and concurrent tests; Apache-2.0.

Secondary or rejected sources included Evidence.dev, Ghost, Strapi, Gatsby, Inngest, generic dashboard starters, and generic AI report generators. They were rejected where licensing, maturity, or domain fit was insufficient. No external source supplied Local SEO facts or customer copy.

## What The Sources Do Well

The reusable patterns are:

1. Preserve one complete immutable semantic snapshot per publication version.
2. Keep a customer claim distinct from the observation/evidence and system provenance that support it.
3. Bind a human promotion decision to the exact digest reviewed and strengthen prechecks into a PostgreSQL compare-and-set.
4. Move terminal state, immutable artifact pointer, and actor evidence together.
5. Make renderer inputs complete and versioned; preserve delivered bytes instead of silently rerendering history.
6. Freeze a typed proposed action before asking for consent.
7. Treat workflow/agent approval state as orchestration, not product authority.
8. Use PostgreSQL uniqueness, row locks, and conditional transitions as idempotency truth, with real concurrent tests.

## What We Steal

Adopt a digest-bound hybrid:

```text
current operational truth
-> bounded frozen evidence packet
-> deterministic typed claims and action descriptors
-> optional bounded narrative fragments
-> canonical immutable report snapshot and digest
-> exact human publication decision
-> immutable HTML, later optional PDF
-> typed human action receipt
-> existing controlled Opportunity/Page/Release workflow
```

Canonical JSON owns historical report semantics. Normalized claims, evidence, links, events, actions, and artifacts enforce integrity and audit but do not become a second customer-document truth.

AI may draft only bounded fact-light prose after the server selects facts and actions. Factual sentences, values, citations, warnings, and action cards are deterministic. Human publication remains mandatory and digest-bound.

A Next Action is either an allowlisted navigation reference or a typed command offer. It is never an arbitrary route, tool, endpoint, command string, or JSON payload. Consequential offers reuse the exact target use case permission and expected-state/revision guard.

## How It Maps To Our Stack

```text
packages/contracts/src/report.ts
  strict snapshot, claim, evidence, action, job, event, and API contracts

packages/domain/src/report.ts
  pure eligibility, lifecycle, ordering, canonical identity, and action decisions

packages/ai/src/report-narrative.ts
  bounded prompt/output/QA helpers behind AiReasoningPort

apps/api/src/modules/reports.module.ts
  project-scoped generation, review, publication, correction, reads, and action receipts

apps/worker/src/handlers/report-*.ts
  deterministic assembly, optional narrative, rendering, and later export

apps/web/src/screens/reports.tsx
  report review/publication and explicit typed action surfaces

PostgreSQL
  lifecycle, actors, uniqueness, row locks, CAS, provenance, and durable intent

BullMQ
  transport only, with DB-before-queue recovery
```

## Decision

Adopted in ADR 0021 with a narrower first delivery than the complete research envelope:

1. contracts and canonicalization;
2. core report issue/run/version/provenance schema;
3. deterministic fact-only report;
4. human review/publication/correction plus stored HTML;
5. optional AI narrative;
6. navigation actions, then selected command offers;
7. PDF only when required;
8. retention and operational hardening when product/legal policy exists.

RAG, generic workflow/action engines, autonomous publication, AI-selected facts/actions, public links, scheduling, collaborative editing, and a report-driven release-status split remain deferred.
