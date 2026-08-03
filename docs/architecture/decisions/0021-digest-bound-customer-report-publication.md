# 0021 - Digest-Bound Customer Report Publication And Typed Next Action Boundary

Date: 2026-08-01
Status: Accepted

## Context

The Report and Next Action vertical is the next product milestone. The repository currently has only a skeletal `reports` table, route/task/event vocabulary, a fail-closed `report_narrative` policy placeholder, and customer-report safety checks. It does not yet have a customer-report aggregate, deterministic claim assembly, reviewed publication, correction history, artifacts, or typed action handoff.

Customer reports combine several truths that must not be collapsed:

- current ranking, page, release, deployment, verification, rollback, and recovery state;
- the exact claims and evidence selected for one historical report;
- the human decision that made one reviewed report customer-visible;
- the HTML or later PDF bytes delivered to the customer;
- a customer's decision to enter a separate controlled workflow.

The report must not rebuild history from mutable operational rows when it is read. It must not treat `releasePlans.status` as a complete explanation of delivery or health. It must not use GSC impressions, CTR, average position, weak opportunity signals, or AI-generated prose as customer proof.

A focused pattern-mining pass inspected pinned revisions of Metabase, DataHub, OSCAL Trestle, Payload, Directus, Documenso, Carbone, HumanLayer, Mastra, and Trigger.dev. The adapted patterns are whole-snapshot revision history, normalized claim-to-evidence provenance, digest-bound promotion, atomic terminal artifact/audit transitions, complete render manifests, frozen action intent, workflow approval as orchestration rather than product authority, and PostgreSQL-backed idempotency with real race tests. No external code is copied.

## Decision

### Product Concepts

`CustomerReport` is a project-owned publication and is separate from the lead-facing `PotentialReport`. Existing PotentialReport contracts, routes, and lifecycle vocabulary are not reused as customer-report truth. Authenticated published reads reuse project membership so viewers can read delivered reports; generation, review, export, publication, and correction remain explicit report permissions.

The first report kind is a monthly Local SEO progress report. Its canonical identity is:

```text
projectId
+ reportKind = monthly_seo_progress
+ local period key = YYYY-MM
+ locale = de-DE
+ timezone = Europe/Berlin
```

The initial locale/timezone are explicit product defaults because projects do not yet own locale/timezone settings. They remain persisted identity and snapshot fields so project-level configuration can be introduced later without changing historical reports.

V1 does not require four-eyes publication. `owner` and `admin` may generate, review, publish, correct, and export. `editor` may generate, review, request changes, and export, but may not publish or correct. `viewer` may read published reports only. Mutations and export use explicit report permissions rather than unrelated page/release permissions; authenticated published reads reuse resolved project membership so viewers can read delivered reports. Owner/admin self-publication is allowed in V1, but publication is still a fresh authenticated human action bound to the exact reviewed digest.

Reviewers cannot directly edit narrative text in V1. They return a candidate to draft and regenerate it. Direct human prose editing requires a later decision about provenance, revalidation, and review invalidation.

### Authority Model

Use a digest-bound hybrid:

1. Current operational rows own current ranking, page, release, deployment, verification, rollback, and recovery truth.
2. One strict canonical JSON snapshot owns the semantic statement made by one report version.
3. Normalized claim, evidence, link, lifecycle, action, and artifact rows enforce provenance, authorization, audit, and queryability. They are not a second customer-document authority.
4. Stored HTML and later PDF are immutable derivatives of one snapshot digest. They do not add facts.

Published reads use the stored canonical snapshot and selected published artifact. They never reconstruct the report by joining current operational rows.

The first implementation stores the exact canonical UTF-8 JSON text and its SHA-256 on `reports`. It does not add an independently writable JSONB copy. If a query copy is justified later, it must be derived and verified in the same transaction and must never become publication authority.

The canonicalization implementation must:

- strictly parse through contracts and reject unknown keys;
- reject duplicate logical IDs, unsafe/non-finite numbers, and invalid text;
- normalize timestamps to UTC while retaining locale/timezone for display;
- sort semantic arrays by documented stable keys before canonical JSON serialization;
- include schema, assembler, eligibility, action-selection, narrative-policy, and template versions where relevant;
- compute `factProjectionSha256` over deterministic claims, evidence, links, and action descriptors;
- embed that digest in the full snapshot and compute `snapshotSha256` over the exact canonical UTF-8 bytes.

The selected canonical JSON library and array-ordering rules must be pinned by contract/property tests before report persistence ships.

### Aggregate And Incremental Schema

`report_issues` is the stable aggregate and lock row for one project, report kind, canonical month, locale, and timezone. In this domain, "issue" means one monthly publication slot, not a defect ticket. A unique database constraint owns that identity.

The core aggregate is introduced incrementally:

```text
Foundation
  report_issues
  report_generation_runs
  reports
  report_claims
  report_evidence_items
  report_claim_evidence
  report_lifecycle_events

Publication slice
  report_artifacts
  report_evidence_alerts when source invalidation is integrated

Consequential Next Action slice
  report_next_action_offers
  report_next_action_receipts
  report_next_action_dispatches
```

Do not create future tables merely to match the complete research model. Each table lands with the behavior, constraints, and integration tests that make it authoritative.

`reports` are versioned candidates within one issue. Snapshot semantics may change only while a row is `draft`, only through a generation run pinned to the expected issue/report row version and digest. Entering `ready_for_review` freezes that semantic version; published and superseded versions are permanently immutable. The report lifecycle is:

```text
draft -> ready_for_review -> published -> superseded
```

Returning `ready_for_review` to `draft` is a human review decision that invalidates the reviewed digest. Published content never returns to draft. Corrections create a new reviewed report version with an explicit predecessor and correction reason. One publication transaction marks the predecessor `superseded`, publishes the successor, updates the issue head, selects the exact HTML artifact, and appends actor evidence. The predecessor snapshot and artifacts remain unchanged and addressable with a replacement banner. Actions on superseded reports are view-only.

Generation lifecycle is separate from report lifecycle:

```text
queued -> assembling -> narrative_running -> validating -> succeeded
                                                    \-> failed | cancelled | stale
```

Fact-only generation may skip `narrative_running`. Export lifecycle is also separate. Generation failure, PDF failure, and downstream action failure must not overwrite report publication truth.

### Claims And Evidence

Server-owned deterministic policy selects claims, evidence, proof tiers, values, warnings, and Next Action descriptors at a fixed cutoff. Every evidentiary claim links to one or more project-scoped frozen evidence items that retain the minimum selected values, source identity/version, observation time, cutoff, proof tier, and payload digest needed to justify the claim. Release-related evidence also carries the release-plan identity needed to bind any `release_review` navigation target inside the immutable snapshot; publication and rendering never reconstruct that target from mutable deployment rows.

For `monthly_seo_progress`, the period is the completed `Europe/Berlin` calendar month. Generation accepts an evidence cutoff from local month-end through a seven-day grace window and never accepts a future cutoff. Page approvals and provider handoffs must occur inside the local month. Ranking proof is a fresh as-of-cutoff result; future opportunities are current supporting context as of the cutoff. Verification, warning, and rollback evidence may occur from period start through the cutoff so a correction completed during the short generation grace can replace an earlier warning. Mutable lifecycle rows updated after the cutoff are excluded because V1 does not reconstruct historical in-row state.

The initial customer-safe claim catalog is limited to:

- reviewed, fresh ranking results such as Top 10, Top 5, Top 3, rank 2, or rank 1;
- approved/released page delivery stated separately from live health;
- provider handoff stated separately from persisted verification;
- verified live health and warnings from detailed verification checks;
- rollback/correction facts backed by rollback and subsequent verification evidence;
- future opportunities displayed separately and excluded from completed-win totals.

Revenue, ROI, guaranteed outcomes, broad ranking trends without every defined input, GSC impressions, CTR, average position, and weak internal radar signals are excluded.

Only the latest terminal verification per deployment may contribute live-health and warning claims. Customer warnings use a closed server-owned `(checkKey, scope)` catalog and fixed customer-language title/summary text. GSC checks, recovery/execution checks, unknown keys, and raw operator/provider messages remain internal even when their detailed check rows are retained as operational truth.

Report assembly reads detailed approvals, page versions, deployments, release verifications/checks, rollback, and recovery evidence. It does not split `releasePlans.status` for reporting and never translates that coarse status directly into a customer explanation. Reconsider separate stored lifecycle projections only when at least two independent consumers require them.

At publication, the API pre-reads the immutable candidate only to determine a bounded canonical source-lock set. In one short transaction it locks referenced mutable eligibility sources in stable source-kind/id order, then locks and reloads the report issue, report, and staged artifact; rechecks project scope, actor permission, status, row version, digest, source set, source eligibility/freshness, customer safety, and artifact identity; and compare-and-sets publication plus actor evidence. Source invalidation takes an updating lock on the same source row. Invalidation-first blocks publication; publication-first preserves history and creates a durable correction-needed alert.

The report evidence packet and claim counts are bounded before implementation so publication never takes an unbounded lock set. Slice 2 selects at most 180 evidence items against the 200-claim contract cap. Navigation actions are selected after stable-key ordering with explicit Page Studio, Opportunity, and Release-review quotas, preventing input order or one surface from starving the others.

### AI Narrative Boundary

AI is optional draft assistance, never report truth or publication authority. Deterministic fact-only reports must remain useful when no AI provider is configured.

The server selects claims and narrative slots before invoking `report_narrative`. The model receives only bounded customer-safe summaries and stable claim keys. It may return strict text fragments for the assigned slots. It cannot create or change facts, evidence, proof tiers, values, actions, targets, statuses, HTML, approval, or publication.

V1 keeps model prose fact-light. Factual sentences, numbers, dates, ranks, URLs, citations, warning labels, and action cards are rendered deterministically from typed claims. AI may draft headings and short transitions only. Raw HTML, arbitrary Markdown, guarantees, unsupported causal/economic claims, and unlicensed fact tokens fail deterministic QA. Another LLM is not the truth gate.

`report_narrative` uses the existing `AiReasoningPort` and a named ADR 0019 constraint profile. It receives its bounded packet directly and has no production-mutation, publication, generic tool, or retrieval capability. RAG remains deferred until direct bounded evidence loading proves insufficient.

### Typed Next Actions

A Next Action is a typed offer to enter an existing controlled workflow. It is not an arbitrary URL, command string, tool call, JSON blob, endpoint name, or approval shortcut.

The first report delivery supports only `navigation_ref` descriptors to server-allowlisted Opportunity, Page Studio review, and Release review surfaces. Navigation records what the report suggested but is not customer consent and does not emit `CustomerApprovedNextAction`.

Consequential `command_offer` actions ship in a later slice only after the target use case exposes an expected-state/revision compare-and-set boundary. The first candidate kinds are `request_page_proposal` and `prepare_release_plan`. The server freezes action kind, target reference, expected target state/revision, required permission, supporting claims, schema/policy version, and canonical intent digest before asking the human.

The client submits only report identity, stable action key, displayed report digest, and idempotency key. The server reloads the immutable offer, rechecks current report/target/project/permission/state, records one human receipt, and dispatches through one exhaustive adapter into the existing application service. Consent, dispatch, and downstream result remain separate durable conclusions.

Do not add report action kinds for page approval, release approval, deploy, verification override, rollback, arbitrary HTTP, arbitrary navigation, generic tools, or arbitrary arguments. Those workflows retain all existing gates.

### HTML And Export

Stored private HTML is the first published representation. A deterministic renderer receives only the immutable snapshot and a versioned render manifest. It performs no live database/API/provider reads and cannot introduce content absent from the snapshot.

Publication requires one staged HTML artifact for the exact report/project/snapshot digest. The human publication transaction selects that exact artifact and makes it the immutable published pointer. Later rerenders create new artifacts and cannot silently replace the delivered one.

PDF is deferred until a launch or contractual requirement exists. When implemented, it is a bounded asynchronous derivative of the exact stored HTML/snapshot with its own status, checksum, manifest, recovery, and private authenticated delivery. PDF failure never changes report publication status.

### Concurrency, Recovery, And Audit

PostgreSQL owns admission, lifecycle, uniqueness, actor evidence, and idempotency. BullMQ job IDs reduce duplicate transport but do not decide product truth.

Required invariants include:

- one report issue per canonical identity;
- one active generation per issue;
- one open draft/ready candidate per issue;
- one current published report per issue;
- one version number per issue and one correction successor per predecessor;
- conditional worker completion on expected issue/report version and digest;
- one publication transition and actor event for one request identity;
- one command decision and one dispatch per single-use command offer;
- immutable claims, evidence, descriptors, snapshot, and artifact pointer after review/publish.

Workers never hold database locks across model or renderer calls. Generation, rendering, and later async action dispatch use DB-before-queue with deterministic identity and the existing bounded safe-work recovery pattern. `report_narrative` recovery is scoped by `subjectId = reportId`; it must not use a null subject that serializes unrelated report work.

`ReportGenerated` means one validated draft/candidate exists. It does not mean published. `CustomerApprovedNextAction` means one typed human consent receipt exists. It does not mean downstream work completed.

### Module Ownership And Delivery Order

The Report bounded context remains inside the modular monolith:

```text
packages/contracts/src/report.ts       strict shared report/action/job schemas
packages/domain/src/report.ts          pure eligibility, lifecycle, ordering, and action decisions
packages/ai/src/report-narrative.ts    bounded prompt/output/QA helpers
apps/api/src/modules/reports.module.ts authenticated commands, reads, publication, and repositories
apps/worker/src/handlers/report-*.ts   deterministic assembly/narrative/render/export work
apps/web/src/screens/reports.tsx       list/detail/review/publication and typed action UI
```

These files are re-exported and composed through existing package/process entrypoints. Report logic does not widen the already-large Page or Release modules except for narrow transaction-aware application-service adapters or evidence loaders.

Implementation order:

1. strict contracts, canonicalization tests, pure domain decisions, permissions, and event semantics;
2. core issue/run/version/provenance schema with constraints and real PostgreSQL race tests;
3. deterministic fact-only generation from a bounded evidence packet;
4. authenticated review/request-changes commands plus immutable reviewed HTML artifacts and artifact recovery;
5. digest-bound publication/correction, source-invalidation alerts, and published reads;
6. operator/customer report UI over the authenticated report boundaries;
7. optional bounded AI headings/transitions;
8. navigation Next Actions, then selected command offers after target CAS hardening;
9. PDF only when required;
10. retention, observability, and cost hardening alongside the slices that need them.

Slice 0 is implemented in `packages/contracts/src/report.ts` and `packages/domain/src/report.ts`. The contract owns the strict monthly identity, lifecycle vocabulary, closed claim/evidence catalog, exact claim/evidence/action references, navigation-only descriptors, event semantics, UTC timestamp normalization, and customer-safe payload bounds. The domain owns pure eligibility, lifecycle, ordering, ranking milestone, action-availability, and claim-summary decisions. Explicit API permissions now separate generation, review, publication, correction, and export authority.

Canonical JSON uses the Apache-2.0 `canonicalize@3.0.0` RFC 8785 implementation. Before serialization, claims sort by section order then `claimKey`; evidence sorts by `evidenceKey`; Next Actions sort by `actionKey`; narrative fragments sort by `slotKey`; and nested evidence/supporting-claim keys sort by Unicode code-unit order. Contract parsing rejects unknown fields, unsafe integers, invalid Unicode, unsupported controls, non-HTTP evidence URLs, duplicate logical keys, missing references, and unreferenced evidence. Hash persistence remains part of the aggregate/runtime slice; this foundation produces the exact canonical UTF-8 text that the persistence shell will hash.

No report issue, generation, publication, artifact, or action runtime is implied by slice 0. Those remain ordered work below the contract/domain boundary.

Slice 1 implements the aggregate and admission foundation. Migration `0037_customer_report_aggregate` replaces the empty skeletal `reports` table with the stable issue, generation-run, report-version, normalized claim/evidence/link, and append-only lifecycle-event tables. Partial unique indexes own one active generation and one open candidate per issue; issue/report row versions and database triggers enforce the accepted lock order, draft-only semantic mutation, reviewed freeze, an exact canonical-to-normalized projection match before review, exact lifecycle transition evidence, tenant-coherent generation base/result pointers, bounded proof tiers, and append-only review history.

`ReportsService` admits generation against the stable issue row, recomputes the canonical fact-projection and full-snapshot SHA-256 digests, composes deterministic eligibility for every claim, verifies durable evidence sources against the report project, and writes canonical snapshot plus normalized provenance in one transaction. A returned draft may be regenerated only when the admitted issue/report version and digest still match. Review and regeneration both lock issue before report, so review-first makes late generation stale while generation-first makes the old review target conflict. Conditional issue/run/report writes verify their affected row, and review notes use the same bounded Unicode/control policy as report text. Property-based canonicalization coverage and real-PostgreSQL race and direct-mutation tests pin these seams.

Slice 1 intentionally exposes no report controller, queue, evidence assembler, publication write, artifact table, customer read, or UI. The migration rejects publication/supersession transitions until reviewed artifacts and the digest-bound human publication/correction transaction ship.

Slice 2 implements deterministic fact-only generation. An authenticated `report:generate` endpoint admits one actor-backed run under the stable issue lock and enqueues `jobId = runId` only when the report queue is configured; the unconfigured path records dry-run audit without creating phantom report truth. The report worker selects a bounded server-owned packet from reviewed fresh ranking proofs, immutable approved/released (including historically released then superseded) page versions, detailed deployment/verification/check/rollback rows, and near-term opportunities. GSC diagnostic rows, unknown/internal check messages, and coarse release-plan status never enter customer report claims.

Each selected source receives one canonical customer-safe payload digest; that digest is both `sourceVersion` and `payloadSha256`. The worker persists the canonical packet text and SHA-256 on the generation run, deterministically assembles claims and quota-bounded navigation-only actions, recomputes the canonical fact/snapshot digests, re-selects the packet inside the completion transaction, and writes the draft plus normalized provenance under the Slice 1 issue/run/report CAS. Rollback selection treats `rollback_points.deployment_id` as the restore source and resolves the rolled-back target by the point's release plan; only complete rollback execution envelopes become report evidence, while preflight/in-flight/manual rows are skipped. The retained Slice 1 internal completion harness is also packet-bound and recomputes the deterministic projection, so it cannot accept caller-selected facts. Generation responses report whether the current request enqueued transport work rather than inferring that claim from a pre-existing run's durable status. No reasoning adapter or model policy participates. Migration `0038_customer-report-generation-recovery` adds a bounded `read_analyze` recovery lane that re-enqueues the same run id and terminalizes exhausted or transport-inconsistent runs as visible failed truth. Forward migration `0039_report-canonical-collation` pins review-time logical evidence ordering to `COLLATE "C"`, matching canonical code-unit ordering independently of the database locale.

Slice 3 implements authenticated digest-bound review and immutable private HTML staging. The submit-for-review transaction locks issue, report, and report artifacts in that order; revalidates the stored snapshot and current durable evidence; inserts one pending artifact bound to the exact snapshot and render-manifest digests; then freezes the report as `ready_for_review` with actor-backed lifecycle evidence. Request-changes takes the same locks and expires pending, running, or staged artifacts before returning the report to `draft`, so a renderer that finishes later cannot attach bytes to reopened semantics. Database triggers require an active artifact for the exact reviewed snapshot, reject active artifacts outside review, freeze artifact identity and terminal evidence, and kept publication disabled until Slice 4 opened the reviewed-artifact transition.

The report worker parses only the stored canonical snapshot and strict render manifest, renders bounded script-free HTML, writes bytes through a purpose-named immutable private-storage port, verifies the returned byte identity, and stages the storage key, SHA-256, and byte count only while the exact reviewed report still owns the artifact. Customer-facing timestamps are formatted through the manifest's pinned locale/timezone rather than the worker host timezone. Artifact status is operational derivative truth and never changes report publication status. A separate `artifact_capture` recovery lane reuses `jobId = artifactId`; missing transport is re-enqueued under the same identity, while bounded exhaustion or completed transport without staged product truth becomes visible `failed` artifact evidence. Renderer, stylesheet, or render-manifest version changes require a forward migration because the database pins all three identities. Slice 4 adds the actor-backed re-render path and publication boundary below; UI remains Slice 5.

Slice 4 implements digest-bound human publication, correction succession, source-invalidation alerts, authenticated published reads, and failed-artifact re-render. A re-render request is actor/idempotency bound and creates a new artifact row only after prior rendering failed. Publication reads and verifies the exact staged HTML bytes, locks the immutable snapshot's bounded source set in stable kind/id order, then locks issue, report lineage, and artifacts; it rechecks current source truth and compare-and-sets one reviewed digest and selected artifact. Ranking-proof invalidation takes the same source lock before published reports. Invalidation-first blocks publication; publication-first records a durable open correction alert. Correction generation is explicitly bound to the current published predecessor and a bounded reason. Its publication transaction supersedes the predecessor, publishes the reviewed successor, advances the issue head, resolves predecessor alerts, and appends exact actor/artifact lifecycle events atomically. Published list/detail/document reads parse only stored canonical snapshot truth and verify selected immutable bytes; they never reconstruct customer history from mutable source rows. Slice 5 adds the authenticated report UI over these boundaries. AI narrative, command actions, PDF, and RAG remain later optional work.

Slice 5 implements the authenticated report workspace and completes the first fact-only vertical. Owner/admin/editor workspace reads expose bounded current candidates, latest generation status, stored canonical snapshots, and artifact summaries without storage locations; viewer access remains limited to the existing published list/detail/document reads. The React workspace uses TanStack Query, Form, Router, and Table for explicit generation, review, request-changes, render retry, publication/correction, and immutable history states. Candidate and published HTML are displayed only through sandboxed document routes that re-verify immutable artifact bytes. V1 Next Actions remain typed navigation to Opportunity, Page Studio review, or Release review; the UI cannot submit arbitrary URLs or execute downstream commands. AI narrative, command offers, PDF, RAG, public links, and direct report prose editing remain deferred.

The first vertical proof ends after the report UI slice. It must work without AI, command actions, PDF, RAG, a workflow engine, or public links.

### Retention And Privacy Defaults

Published snapshots, provenance, lifecycle authority, and delivered artifacts are not automatically hard-deleted. Supersession is not deletion. Exact legal retention, erasure, offboarding, backup deletion, legal hold, and actor tombstone policy require product/legal input before cleanup ships.

Drafts, failed runs, bounded model input/output, and staged orphan artifacts may receive shorter operational retention later. No chain-of-thought, secrets, raw provider bodies, internal diagnostics, unnecessary IP/user-agent data, or unrelated customer data belongs in report truth.

## Consequences

- Customer-visible claims have exact, historical, project-scoped provenance.
- Human publication and consequential customer consent are durable product decisions rather than UI or agent state.
- Fact-only generation, AI prose, publication, export, and downstream work can fail independently without corrupting each other's truth.
- The hybrid model costs more tables, hashes, constraints, and race tests than a JSON-only report.
- Exact canonical text plus normalized provenance requires one transactional writer and round-trip digest tests.
- Stored HTML improves auditability but adds artifact staging and orphan cleanup.
- The first implementation is intentionally narrower than the complete research envelope; later tables and workflows land only with their behavior.
- Locale/timezone, four-eyes review, direct prose editing, PDF, and retention remain explicit future product decisions rather than hidden implementation defaults.

## Alternatives Considered

### One JSONB Report Row

Rejected as the durable design. It is small, but evidence/project/type relationships, actor history, correction impact, and consequential action receipts become unenforced JSON conventions.

### Fully Normalized Report Document

Rejected as publication authority. Reconstructing customer output from many rows creates ordering/render drift and couples historical output to future schema changes. Normalization is limited to integrity and provenance.

### AI-Generated Complete Report

Rejected. AI cannot reliably own proof selection, factual values, action selection, or publication. Deterministic policy owns those concerns; AI may only improve bounded draft prose.

### Generic Action Or Workflow Engine

Rejected. Existing Opportunity, Page, Release, deploy, verification, and rollback services already own their gates. Report actions use a closed typed mapping into those boundaries.

### Dynamic Report Rendering Only

Rejected for published output. A changing template could alter what the customer sees without a new report decision. Publication selects immutable stored HTML for the reviewed digest.

### PDF In The First Vertical Proof

Deferred. It adds converter/runtime/resource/recovery concerns without proving report truth or publication authority.

### Split `releasePlans.status` Before Reporting

Rejected for V1. Detailed lifecycle rows already own the required truth. A split needs multiple consumers, not serializer convenience.

## Regression Guard

- Do not rebuild a published report from current operational rows.
- Do not treat JSONB reserialization, HTML, PDF, release-plan status, BullMQ state, Mastra state, or AI output as publication truth.
- Do not let AI select facts, evidence, proof tiers, actions, targets, statuses, or publication.
- Do not publish, correct, return to draft, or record customer action consent without a persisted human actor and exact digest/intent binding.
- Do not let a report action bypass existing Page Studio, page approval, release approval, deploy, verification, or rollback gates.
- Do not introduce command offers before the target use case has an expected-state/revision CAS.
- Do not create all research-model tables in one speculative migration.
- Do not make AI, PDF, RAG, or a workflow engine prerequisites for the deterministic fact-only publication path.
- Do not expose superseded actions as executable or silently replace published snapshot/artifact bytes.
- Do not infer customer delivery/live-health claims from coarse `releasePlans.status` alone.
- Do not let a client or model submit report facts; the server-owned worker packet must be bounded, canonical, source-digest-bound, and re-selected before draft persistence.
- Do not leave active report generation dependent on BullMQ retention; bounded recovery must reuse `jobId = runId` and end in visible durable failure when exhausted.

## Related Files

- `.ai-stealer-findings/2026-08-01-customer-report-publication-next-action.md`
- `.ai-project-rules/11-reporting-anti-regression.md`
- `.ai-project-rules/15-architecture-regression-guards.md`
- `docs/architecture/agent-first-mvp-roadmap.md`
- `docs/architecture/lifecycle-truth-hardening-backlog.md`
- `docs/architecture/decisions/0018-db-before-queue-work-recovery-policy.md`
- `docs/architecture/decisions/0019-agent-constraint-architecture-and-tool-policy.md`
- `packages/seo/src/index.ts`
- `packages/db/src/schema.ts`
- `apps/api/src/modules/opportunities.module.ts`
- `apps/api/src/modules/releases.module.ts`
