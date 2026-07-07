---
description: "Regression guards for repeated architecture review findings"
globs: "apps/**/*.{ts,tsx}, packages/**/*.{ts,tsx}, docs/architecture/**/*.md, docs/progress/**/*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - ".ai-project-rules/02-stack-and-boundaries.md"
  - ".ai-project-rules/04-deployment-agent.md"
  - ".ai-project-rules/11-reporting-anti-regression.md"
  - ".ai-project-rules/14-architecture-direction.md"
priority_schema: "critical > strong > guideline"
---

# Domain Execution Contract: Architecture Regression Guards

<meta-instruction>
Use this shard when a task touches a seam previously found by review: persisted JSON contracts, release/deploy/verify truth, provider mutations, durable worker recovery, evidence proof tiers, roadmap implemented/deferred lists, or PageJson/Page Registry source-of-truth work.
</meta-instruction>

## 1. Guard Categories

<positive-directives>
- Treat repeated review findings as regression categories, not one-off comments.
- Pair every regression category with at least one executable test, static guard, or explicit ADR regression guard.
- Keep fixed seams fail-closed in CI where practical.
- Keep known-open seams visible in `docs/progress/` until fixed; do not hide them in a broad roadmap.
- When a worker writes JSON that an API reads through a strict schema, add a writer-to-reader round-trip assertion or an equivalent strict parse test.
- When an API route touches a provider port, classify the call as read-only, write/mutation, token/state mutation, or queue enqueue before accepting it.
- When a workflow persists a durable run row and enqueues BullMQ work, define DB/queue-gap recovery before treating the lane as production-ready.
- When an agent task gains tools or delegation, define the ADR 0019 constraint profile before accepting the implementation.
</positive-directives>

## 2. Hard Regression Prohibitions

<absolute-constraints>
- DO NOT persist derived/query columns inside strict `jsonb` artifacts unless the read contract explicitly allows those fields.
- DO NOT let a worker persist JSON that the API read path cannot parse through the same strict contract.
- DO NOT let API routes perform production provider mutations directly; enqueue deterministic worker jobs instead.
- DO NOT project `releasePlans.status = "live"` from provider success alone.
- DO NOT rely on preflight checks alone for deploy artifacts; the deploy worker must re-check page-version approval evidence at artifact-build time.
- DO NOT mark shipped UI/API/worker features as deferred in roadmap docs after the same commit ships them.
- DO NOT treat Redis/BullMQ job state as product truth; Postgres durable rows own product state and recovery decisions.
- DO NOT re-post provider mutations from a generic recovery scanner; provider-mutation recovery must reconcile or require manual review.
- DO NOT add or widen agent tool access without a named task constraint profile, output schema, QA gate, approval boundary, and denied-action list.
- DO NOT let agent, subagent, browser, web-search, or Mastra tool output bypass contract parsing and deterministic QA.
</absolute-constraints>

## 3. Category Checklists

### Strict Persisted JSON

<pre-flight-checklist>
1. [ ] Which schema owns the persisted `jsonb` shape?
2. [ ] Does the writer persist exactly that shape, without derived columns or display-only fields?
3. [ ] Does the reader parse through that schema instead of dumping raw unknown JSON?
4. [ ] Is there a regression test proving writer output parses on the read side?
</pre-flight-checklist>

### Provider Mutation Ownership

<pre-flight-checklist>
1. [ ] Does this code call a provider method that mutates remote state or credentials?
2. [ ] If yes, is it in a worker handler with job/run audit, retries, and idempotency?
3. [ ] If it remains in an API route temporarily, is it read-only; otherwise stop and workerize it before adding new product surface.
4. [ ] Are transient and terminal provider failures classified separately?
</pre-flight-checklist>

### Release Live Truth

<pre-flight-checklist>
1. [ ] Does provider success remain deployment transport truth only?
2. [ ] Is `releasePlans.status = "live"` written only from post-deploy verification outcomes?
3. [ ] Do replay paths avoid projecting `provider_succeeded` deployments as live?
4. [ ] Do tests cover provider success, live verification success, and rollback/failed verification?
</pre-flight-checklist>

### Deploy Artifact Approval

<pre-flight-checklist>
1. [ ] Does artifact build re-check page version id, approval status, `approvedAt`, and `pageJson`?
2. [ ] Are redirect/remove/noindex actions explicitly action-conditional instead of implicitly passing through `{}`?
3. [ ] Are missing/unapproved approval cases tested?
</pre-flight-checklist>

### DB-Before-Queue Recovery

<pre-flight-checklist>
1. [ ] Which Postgres row owns durable product truth for this workflow?
2. [ ] What deterministic operation key / BullMQ job id maps to that row?
3. [ ] What Postgres guard prevents duplicate active work?
4. [ ] What happens when the row exists but enqueue fails or the Redis job disappears?
5. [ ] Can stale work be safely re-enqueued, or must it reconcile provider state / mark manual review?
6. [ ] Is recovery exhaustion visible in product state, not only logs or Redis dead-letter state?
</pre-flight-checklist>

### Agent Constraint Policy

<pre-flight-checklist>
1. [ ] Which agent task/profile owns this capability?
2. [ ] Which tool categories are allowed, ask-gated, and denied?
3. [ ] What output schema parses untrusted model output before use?
4. [ ] Which deterministic QA gates reject schema-valid but unsafe output?
5. [ ] What durable approval row/event is required before customer/business state changes?
6. [ ] Can a subagent or tool runner widen authority? If yes, stop and pass/narrow the parent policy.
7. [ ] Does any search/browser/model output risk becoming customer-safe proof without an ADR-promoted source?
</pre-flight-checklist>

### Roadmap Drift

<pre-flight-checklist>
1. [ ] Did the slice update `docs/progress/` with what shipped?
2. [ ] Did roadmap implemented/deferred lists move shipped work out of "deferred"?
3. [ ] Did ADR regression guards gain concrete wording when a review found a new failure mode?
</pre-flight-checklist>

## 4. Fixed Seams To Guard

<context>
Recently fixed seams now enforced by `corepack pnpm text:check`:

```text
GSC verify workerization
  POST /verify must not call VerificationPort.verifyRelease(...) inline.
  POST /verify must not submit sitemap / Search Console handoff inline.
  API creates/reuses a durable running verification row and enqueues a verification worker job.
  Worker owns provider mutations and release-health projection.
```

</context>

<context>
```text
release status hardening
  provider_succeeded must not project releasePlans.status = live.
  Only live_healthy/live_with_warnings verification outcomes may project releasePlans.status = live.
```

</context>

<context>
```text
DB-before-queue recovery policy
  BullMQ is transport, not product truth.
  Durable run rows must define active guards, terminal states, and stale recovery behavior.
  Recovery decisions belong in pure domain policy; recovery controllers are procedural shells.
  Read/analyze work may be re-enqueued by deterministic job id when safe.
  Provider mutation work must reconcile by provider reads or mark manual reconciliation.
```

</context>

<context>
```text
Page Registry render/preflight boundary
  Worker renders approved PageJson into StaticSiteArtifact before provider handoff.
  Provider adapters upload bytes only and must not import page-registry/domain renderers.
  Release preflight consumes registry-validated PageJson and registry-derived SEO facts, not loose key duck typing or contract-only parsing.
  Renderer and preflight must agree on release-resolved robots values.
  Release preflight blocks actions that do not yet materialize to rendered files or explicit directive artifacts.
  PageJson safety guards reject raw markup, scripts, event handlers, inline styles, className, and literal class keys.
  Preview rendering must call the page-registry renderer core, and deploy-preview output must stay byte-identical to deploy artifact output for the same PageJson.
```

</context>

<context>
```text
Page Version immutability
  Approved, release-candidate, released, and superseded page versions are frozen structural artifacts.
  Edits after approval must create a new page_versions row with a new versionNumber.
  The database trigger must reject in-place changes to page_proposal_id, version_number, and page_json for frozen versions.
  Frozen versions require approved_at and must not be deleted.
```

</context>

<context>
```text
Agent constraint policy
  AI may propose; only contracts, QA, approval, workers, and verification can make a proposal real.
  New agent tasks and widened tool access require a named constraint profile.
  Opportunity Scout remains read_evidence + analyze only.
  Page Proposal may draft structured PageProposalJson only after contracts, registry, Page Studio composition, preview, and approval boundaries are in place.
  Agent/session/tool approval is not product approval; product approval must be durable.
  Subagents inherit or narrow parent denied outcomes.
```

</context>

## 5. Executable Guard

<context>
`corepack pnpm text:check` runs `tools/check-architecture-regression-guards.ts`.

The script must fail on fixed seam regressions and may warn on explicitly tracked open seams. When an open seam is fixed, update the script from warning to failure so the old behavior cannot return.
</context>
