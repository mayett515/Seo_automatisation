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
Use this shard when a task touches a seam previously found by review: persisted JSON contracts, release/deploy/verify truth, provider mutations, evidence proof tiers, roadmap implemented/deferred lists, or PageJson/Page Registry source-of-truth work.
</meta-instruction>

## 1. Guard Categories

<positive-directives>
- Treat repeated review findings as regression categories, not one-off comments.
- Pair every regression category with at least one executable test, static guard, or explicit ADR regression guard.
- Keep fixed seams fail-closed in CI where practical.
- Keep known-open seams visible in `docs/progress/` until fixed; do not hide them in a broad roadmap.
- When a worker writes JSON that an API reads through a strict schema, add a writer-to-reader round-trip assertion or an equivalent strict parse test.
- When an API route touches a provider port, classify the call as read-only, write/mutation, token/state mutation, or queue enqueue before accepting it.
</positive-directives>

## 2. Hard Regression Prohibitions

<absolute-constraints>
- DO NOT persist derived/query columns inside strict `jsonb` artifacts unless the read contract explicitly allows those fields.
- DO NOT let a worker persist JSON that the API read path cannot parse through the same strict contract.
- DO NOT let API routes perform production provider mutations directly; enqueue deterministic worker jobs instead.
- DO NOT project `releasePlans.status = "live"` from provider success alone.
- DO NOT rely on preflight checks alone for deploy artifacts; the deploy worker must re-check page-version approval evidence at artifact-build time.
- DO NOT mark shipped UI/API/worker features as deferred in roadmap docs after the same commit ships them.
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
3. [ ] If it remains in an API route temporarily, is it recorded as a known-open seam with a follow-up slice?
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

### Roadmap Drift

<pre-flight-checklist>
1. [ ] Did the slice update `docs/progress/` with what shipped?
2. [ ] Did roadmap implemented/deferred lists move shipped work out of "deferred"?
3. [ ] Did ADR regression guards gain concrete wording when a review found a new failure mode?
</pre-flight-checklist>

## 4. Current Known Open Seams

<context>
These are not acceptable end states; they are tracked exceptions until the next release-spine hardening slices land.

```text
release status hardening
  provider_succeeded still projects releasePlans.status = live in the deploy worker.
  Target fix: only post-deploy verification may project releasePlans.status = live.

GSC verify workerization
  POST /verify still submits sitemap / Search Console handoff inline.
  Target fix: API enqueues a verification worker job; worker owns provider mutations.
```

</context>

## 5. Executable Guard

<context>
`corepack pnpm text:check` runs `tools/check-architecture-regression-guards.ts`.

The script must fail on fixed seam regressions and may warn on explicitly tracked open seams. When an open seam is fixed, update the script from warning to failure so the old behavior cannot return.
</context>
