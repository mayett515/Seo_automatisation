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

`CustomerReport` is a project-owned publication and is separate from the lead-facing `PotentialReport`. Existing PotentialReport contracts, routes, and lifecycle vocabulary are not reused as customer-report truth.

The first report kind is a monthly Local SEO progress report. Its canonical identity is:

```text
projectId
+ reportKind = monthly_seo_progress
+ local period key = YYYY-MM
+ locale = de-DE
+ timezone = Europe/Berlin
```

The initial locale/timezone are explicit product defaults because projects do not yet own locale/timezone settings. They remain persisted identity and snapshot fields so project-level configuration can be introduced later without changing historical reports.

V1 does not require four-eyes publication. `owner` and `admin` may generate, review, publish, correct, and export. `editor` may generate, review, request changes, and export, but may not publish or correct. `viewer` may read published reports only. These capabilities are represented by explicit report permissions rather than inferred from `project:read` or unrelated page/release permissions. Owner/admin self-publication is allowed in V1, but publication is still a fresh authenticated human action bound to the exact reviewed digest.

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

`reports` are immutable semantic versions within one issue. The report lifecycle is:

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

Server-owned deterministic policy selects claims, evidence, proof tiers, values, warnings, and Next Action descriptors at a fixed cutoff. Every evidentiary claim links to one or more project-scoped frozen evidence items that retain the minimum selected values, source identity/version, observation time, cutoff, proof tier, and payload digest needed to justify the claim.

The initial customer-safe claim catalog is limited to:

- reviewed, fresh ranking results such as Top 10, Top 5, Top 3, rank 2, or rank 1;
- approved/released page delivery stated separately from live health;
- provider handoff stated separately from persisted verification;
- verified live health and warnings from detailed verification checks;
- rollback/correction facts backed by rollback and subsequent verification evidence;
- future opportunities displayed separately and excluded from completed-win totals.

Revenue, ROI, guaranteed outcomes, broad ranking trends without every defined input, GSC impressions, CTR, average position, and weak internal radar signals are excluded.

Report assembly reads detailed approvals, page versions, deployments, release verifications/checks, rollback, and recovery evidence. It does not split `releasePlans.status` for reporting and never translates that coarse status directly into a customer explanation. Reconsider separate stored lifecycle projections only when at least two independent consumers require them.

At publication, the API pre-reads the immutable candidate only to determine a bounded canonical source-lock set. In one short transaction it locks referenced mutable eligibility sources in stable source-kind/id order, then locks and reloads the report issue, report, and staged artifact; rechecks project scope, actor permission, status, row version, digest, source set, source eligibility/freshness, customer safety, and artifact identity; and compare-and-sets publication plus actor evidence. Source invalidation takes an updating lock on the same source row. Invalidation-first blocks publication; publication-first preserves history and creates a durable correction-needed alert.

The report evidence packet and claim counts are bounded before implementation so publication never takes an unbounded lock set.

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
4. review, request-changes, digest-bound publication/correction, source-invalidation alerts, private stored HTML, and published read;
5. optional bounded AI headings/transitions;
6. navigation Next Actions, then selected command offers after target CAS hardening;
7. PDF only when required;
8. retention, observability, and cost hardening alongside the slices that need them.

Slice 0 is implemented in `packages/contracts/src/report.ts` and `packages/domain/src/report.ts`. The contract owns the strict monthly identity, lifecycle vocabulary, closed claim/evidence catalog, exact claim/evidence/action references, navigation-only descriptors, event semantics, UTC timestamp normalization, and customer-safe payload bounds. The domain owns pure eligibility, lifecycle, ordering, ranking milestone, action-availability, and claim-summary decisions. Explicit API permissions now separate generation, review, publication, correction, and export authority.

Canonical JSON uses the Apache-2.0 `canonicalize@3.0.0` RFC 8785 implementation. Before serialization, claims sort by section order then `claimKey`; evidence sorts by `evidenceKey`; Next Actions sort by `actionKey`; narrative fragments sort by `slotKey`; and nested evidence/supporting-claim keys sort by Unicode code-unit order. Contract parsing rejects unknown fields, unsafe integers, invalid Unicode, unsupported controls, non-HTTP evidence URLs, duplicate logical keys, missing references, and unreferenced evidence. Hash persistence remains part of the aggregate/runtime slice; this foundation produces the exact canonical UTF-8 text that the persistence shell will hash.

No report issue, generation, publication, artifact, or action runtime is implied by slice 0. Those remain ordered work below the contract/domain boundary.

The first vertical proof ends after step 4. It must work without AI, command actions, PDF, RAG, a workflow engine, or public links.

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
