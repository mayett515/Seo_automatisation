# 0010 - HTTP Verification And Release Status Projection

Date: 2026-06-30
Status: Accepted

## Context

Foundation Milestone 2 replaced the synthetic release `verify()` response with an HTTP-first verifier. The API now persists `release_verifications` and `release_verification_checks`, updates `deployments.status` and `deployments.verificationStatus`, and projects the result back onto `releasePlans.status`.

The current `releasePlanStatuses` enum is intentionally coarse:

```text
draft
ready
ready_with_warnings
blocked
approved_for_deploy
deploying
live
failed
rolled_back
```

It does not distinguish provider deploy failure from post-deploy verification failure or rollback recommendation. Review feedback flagged that future UI/reporting work could misread `releasePlans.status = "failed"` as "the provider deploy never succeeded," when the precise truth may be "the provider deploy succeeded, but live health verification found a blocker."

## Decision

Use `releasePlans.status` as a coarse release-level projection, not as the detailed live-health source of truth.

For post-deploy verification results:

```text
live_healthy          -> releasePlans.status = live
live_with_warnings    -> releasePlans.status = live
rollback_recommended  -> releasePlans.status = failed
failed                -> releasePlans.status = failed
```

This mapping is deliberately conservative. A release plan must not remain `live` when observed live evidence recommends rollback or verification failed.

The precise reason for the failed projection lives in the detailed records:

```text
deployments.status
deployments.verificationStatus
release_verifications.status
release_verification_checks.result/severity/message/evidence
```

UI, reporting, customer-facing release notes, and future automation must read those detail records before explaining why a release is failed, warning, rollback-recommended, or healthy.

## Consequences

What becomes safer:

- A release plan no longer overclaims `live` after verification finds blockers.
- Customer-facing surfaces have a simple top-level "not healthy/live" signal.
- The exact verification evidence remains append-only and auditable in verification records.

Trade-offs:

- `releasePlans.status = "failed"` now has more than one possible cause.
- UI/reporting code cannot use the release plan status alone to explain failure.
- Operators must inspect deployment and verification rows to distinguish provider failure from live-health failure until a richer release-plan enum or health field exists.

Follow-up:

- Before customer-facing lifecycle UI, decide whether to add richer release-plan states such as `verification_failed`, `rollback_recommended`, or `rollback_pending`, or a separate release health projection field.
- Integration tests must prove that verification writes parent and child verification rows, updates deployment health, and updates the release plan coarse projection transactionally.

## Alternatives Considered

### Leave `releasePlans.status = live` When Verification Fails

Rejected. Provider success is not live-health truth. Leaving the release plan as `live` after blockers would cause UI/reporting to overclaim success.

### Add `rollback_recommended` To `releasePlanStatuses` Immediately

Deferred. The deployment status and verification records already carry the precise outcome. Adding release-plan states is a contract and migration change that should be driven by the UI/rollback workflow needs, not by the baseline HTTP verifier alone.

### Store All Truth Only On `releasePlans`

Rejected. Verification is evidence-rich and route/check-specific. Collapsing it into one release-plan enum would lose the audit trail needed for rollback decisions, reporting, and debugging.

## Regression Guard

- Do not explain `releasePlans.status = "failed"` without checking deployment and verification detail rows.
- Do not show customer-facing "deploy failed" language for a release that actually deployed but has `deployments.status = "rollback_recommended"`.
- Do not treat provider success as live-health success.
- Do not project `releasePlans.status = "live"` from `deployments.status = "provider_succeeded"`; only post-deploy verification outcomes may project the coarse release plan to `live`.
- Do not add UI/reporting copy that ignores `release_verification_checks` evidence when verification exists.
- Do not replace detailed verification evidence with a single release-plan status.

## Related Files

- `apps/api/src/modules/releases.module.ts`
- `packages/contracts/src/index.ts`
- `packages/db/src/schema.ts`
- `packages/adapters/src/http-release-verification.ts`
- `docs/architecture/backend-foundation-status.md`
- `.ai-project-rules/04-deployment-agent.md`
- `.ai-project-rules/10-seo-verification-gsc.md`
