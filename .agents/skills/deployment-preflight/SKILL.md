---
name: deployment-preflight
description: Assess and verify SEO release readiness, approval, deploy enqueue, Netlify execution, post-deploy health, sitemap publication, and rollback evidence. Use for release plans, deployment endpoints or workers, go-live checks, and rollback decisions; not for a generic build-only smoke test.
---

# Deployment preflight

Treat reasoning and risk assessment separately from deterministic execution. Never perform or enqueue an external deployment without the authorization already required by the user and repository.

1. Load the persisted release plan, current page versions, required notes, approval record, actor evidence, and latest preflight result.
2. Classify pre-deploy state as `READY`, `READY_WITH_WARNINGS`, `BLOCKED`, or `DEPLOYING`. A blocker stops execution; warnings remain visible.
3. Verify only approved page versions are included, required notes are resolved, the approving actor is persisted, and the current preflight has not invalidated an older approval.
4. Check components/assets, SEO metadata, canonical/robots, schema, route conflicts, DNS, sitemap readiness, tracking readiness, staging noindex, and rollback evidence.
5. Before enqueue, recompute the deterministic domain gate from persisted state. A request sequence is not proof of approval or readiness.
6. After execution, verify live HTTP behavior, canonical, robots/indexability, schema, sitemap, tracking, and critical routes independently of provider acceptance.
7. Persist `LIVE_HEALTHY`, `LIVE_WITH_WARNINGS`, or `ROLLBACK_RECOMMENDED`. Use `ROLLED_BACK` only after rollback execution and state persistence.

Every returned status must describe a persisted decision, real enqueue, executed deployment, or verified outcome. If infrastructure is unavailable, return or recommend an honest `dry_run`, `not_configured`, `pending`, or `blocked` state.

Output blockers, warnings, evidence checked, authorized next action, and verification gaps. Do not claim release success from a successful provider build alone.
