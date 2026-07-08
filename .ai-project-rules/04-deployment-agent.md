---
description: "Deployment Agent release-manager rules for Netlify, sitemap, verification, and rollback"
globs: "**/*release*.{md,json,mmd,ts,tsx}, **/*deploy*.{md,json,mmd,ts,tsx}, **/*netlify*.{md,json,mmd,ts,tsx}, **/*sitemap*.{md,json,mmd,ts,tsx}, **/*rollback*.{md,json,mmd,ts,tsx}"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "deployment-agent-extension-only/local-seo-product-knowledge-pack/product/13-deployment-agent.md"
  - "deployment-agent-extension-only/local-seo-product-knowledge-pack/architecture/10-deployment-agent-architecture.md"
  - "deployment-agent-extension-only/local-seo-product-knowledge-pack/backend/04-deployment-agent-contracts.md"
priority_schema: "critical > strong > guideline"
---

# Domain Execution Contract: Deployment Agent

<meta-instruction>
You have been routed here because the task touches release plans, deployment readiness, Netlify deploys, sitemap publication, verification, release notes, or rollback.
</meta-instruction>

## 1. Focused Best Practices

<positive-directives>
- Treat the Deployment Agent as reasoning, explanation, risk assessment, and release planning.
- Treat Deploy, Sitemap, Tracking Injector, Verification, and Rollback Workers as deterministic execution.
- Use pre-deploy release readiness states: READY, READY_WITH_WARNINGS, BLOCKED, DEPLOYING.
- Use post-deploy verification outcomes: LIVE_HEALTHY, LIVE_WITH_WARNINGS, ROLLBACK_RECOMMENDED.
- Use ROLLED_BACK only after the rollback worker executes and persists the resulting release/deployment state.
- Require post-deploy verification before a release is considered successful.
- Create rollback evidence before production releases when a previous stable state exists.
- Persist release notes, verification outcomes, release checks, deployments, and rollback points as separate records.
- Keep release API routes project-scoped unless the handler resolves `releasePlanId -> projectId` before authorization.
- Persist approval decisions before deploy execution can be queued.
- Verify the persisted release state with deterministic domain logic before enqueueing a deploy worker.
- Apply side-effect honesty: returned release/deploy states must describe persisted approval, real enqueue, executed deploy, or verified evidence rather than desired future state.
</positive-directives>

## 2. Hard Domain Prohibitions

<absolute-constraints>
- DO NOT mark a release successful only because Netlify deploy succeeded.
- DO NOT deploy unapproved page versions.
- DO NOT enqueue deploy execution unless the persisted release plan is `approved_for_deploy` and deploy readiness checks pass.
- DO NOT deploy when required customer notes are unresolved.
- DO NOT allow staging URLs to be indexable.
- DO NOT leave intended live pages blocked by noindex or broken canonicals.
- DO NOT expose release-plan-only routes before release-plan ownership is resolved and authorized.
- DO NOT treat an `approve-deploy` response as approval unless the approval and actor are persisted.
- DO NOT return `approved`, `queued`, `deployed`, `verified`, or `successful` unless that exact side effect happened and has persisted evidence.
</absolute-constraints>

## 3. Context-Dependent Trigger Gates

<conditional-logic>
IF a blocker exists:
THEN set release status to BLOCKED and do not enqueue deploy execution.

IF warnings exist without blockers:
THEN use READY_WITH_WARNINGS and explain customer-visible risk.

IF post-deploy HTTP, robots, canonical, schema, sitemap, or route checks fail severely:
THEN persist a ROLLBACK_RECOMMENDED verification outcome and rollback evidence.

IF an API route acts on a release plan:
THEN use `/projects/:projectId/releases/:releasePlanId/...` or load the release plan first and authorize its project before executing.

IF a deploy endpoint is called:
THEN load the release plan and release checks from persistence, verify `canDeployRelease(...)`, and only then enqueue the deterministic deploy worker.

IF approval is granted:
THEN persist the approving actor, decision timestamp, release status, and approval record before returning success.

IF release preflight is rerun after deploy approval:
THEN treat the new preflight result as current release readiness and require a fresh deploy approval before deploy enqueue.

IF release/deploy infrastructure is not wired yet:
THEN return an explicit `dry_run`, `not_configured`, `pending`, or `blocked` state instead of a production-success-looking response.
</conditional-logic>

## 4. Domain Anchoring & Examples

<context>
Required preflight scope: approval, notes, components, assets, SEO metadata, canonical/robots, schema, route conflicts, DNS, sitemap readiness, tracking readiness, staging noindex.

Project-scoped release API shape:

```text
POST /projects/:projectId/releases/plan
GET  /projects/:projectId/releases/:releasePlanId
POST /projects/:projectId/releases/:releasePlanId/preflight
POST /projects/:projectId/releases/:releasePlanId/approve-deploy
POST /projects/:projectId/releases/:releasePlanId/deploy
POST /projects/:projectId/releases/:releasePlanId/verify
GET  /projects/:projectId/releases/:releasePlanId/notes
GET  /projects/:projectId/releases/:releasePlanId/rollback-points
```

<example>
```text
// Good: deployment agent stays in coordinator role
The release has no blockers and two warnings. Queue deploy_worker.execute_release after customer approval.
```
</example>

<example>
```text
// Bad: deploy success is treated as release success
Netlify returned success, so the release is live and healthy.
```
</example>
</context>

## 5. Domain Post-Flight Verification

<pre-flight-checklist>
1. [ ] Did the release have approval and resolved required notes?
2. [ ] Did post-deploy verification run before success was reported?
3. [ ] Did blockers prevent execution and warnings remain visible?
4. [ ] Did deploy enqueue verify the persisted release state instead of trusting request order?
5. [ ] Did every returned status match a real persisted or executed side effect?
</pre-flight-checklist>
