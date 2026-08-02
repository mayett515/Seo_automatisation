# 0010 - HTTP Verification And Release Status Projection

Date: 2026-06-30
Status: Accepted

## Context

Foundation Milestone 2 replaced the synthetic release `verify()` response with an HTTP-first verifier. The follow-up release-spine hardening moved verifier execution and Google Search Console handoff out of the API request path and into a BullMQ worker. The API now creates or reuses a durable `release_verifications.status = running` row and enqueues `release-verification`; the worker persists `release_verification_checks`, updates `deployments.status` and `deployments.verificationStatus`, and projects the result back onto `releasePlans.status`.

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

Release-plan readiness, approval, deploy-start, and replay projections are expected-state writes. Preflight and deploy approval lock the plan row, re-read its status, and replace checks/status or approval evidence only from their explicit allowed state sets. Rerunning preflight from `approved_for_deploy` invalidates that approval projection and restores included `release_candidate` page versions to `approved` in the same transaction. Deploy enqueue and worker deployment-ledger start may project only `approved_for_deploy`/`deploying` plans. A verified deploy replay may project only `deploying`/`live` plans. Terminal plans are not preflightable and cannot be resurrected by a stale request or queued job.

Verification keeps the rollback worker's rollback-point-before-deployment-before-plan lock order. It locks project/plan rollback points and uses the shared ADR 0013 predicate to recognize `restore_in_flight`/`rollback_pending` in either rollback evidence shape as ownership of lifecycle projection. `deployments.providerOperationStatus = "manual_reconciliation_required"` is a separate hard stop because provider outcome is unknown. In either case, or when the deployment compare-and-set loses to a committed terminal transition, the terminal verification row and checks remain detailed audit truth while deployment, plan, and page-version state stays untouched. A rollback that is active, manually unresolved, or already committed therefore cannot be overwritten by a late healthy verifier result.

Every terminal verification row records `lifecycleProjection` evidence as `projected`, `not_applicable`, or `suppressed`. Suppressed evidence carries a stable reason: `active_rollback_execution`, `manual_reconciliation_required`, or `deployment_state_changed`. Worker completion output carries the same outcome, so a healthy observation whose lifecycle projection was suppressed is not success-shaped without qualification.

The precise reason for the failed projection lives in the detailed records:

```text
deployments.status
deployments.verificationStatus
release_verifications.status
release_verification_checks.result/severity/message/evidence
```

`deployments.verificationStatus` describes the last verification that successfully won lifecycle projection. When verification loses to active, manually unresolved, or committed rollback ownership, the terminal `release_verifications` row, its projection evidence, and child checks retain the newer audit result without overwriting deployment truth.

UI, reporting, customer-facing release notes, and future automation must read those detail records before explaining why a release is failed, warning, rollback-recommended, or healthy.

## Consequences

What becomes safer:

- A release plan no longer overclaims `live` after verification finds blockers.
- Concurrent preflight, approval, cancellation, verification, and rollback writers cannot revive a terminal release state through stale reads.
- Customer-facing surfaces have a simple top-level "not healthy/live" signal.
- The exact verification evidence remains append-only and auditable in verification records.
- Provider mutations and token refreshes happen in the worker lane with queue audit and retry semantics, not inside the HTTP request lifecycle.

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
- Do not write preflight checks/readiness or deploy approval from a status read outside the owning transaction; lock and re-check the release plan.
- Do not let deploy enqueue or deployment-ledger creation overwrite a plan that concurrently left `approved_for_deploy`/`deploying`.
- Do not let verified deploy replay overwrite a plan that already became `failed` or `rolled_back`.
- Do not project a late verification result while rollback execution evidence is `restore_in_flight`/`rollback_pending`, while provider operation state is `manual_reconciliation_required`, or after a deployment became `rolled_back`.
- Do not persist a terminal verification result without explicit projected/not-applicable/suppressed lifecycle-projection evidence.
- Do not call `VerificationPort.verifyRelease(...)` or `SearchConsolePort.submitSitemap(...)` from the API `verify()` path; API starts/reuses the durable verification run, worker executes it.

## Related Files

- `apps/api/src/modules/releases.module.ts`
- `packages/contracts/src/index.ts`
- `packages/db/src/schema.ts`
- `packages/adapters/src/http-release-verification.ts`
- `docs/architecture/backend-foundation-status.md`
- `.ai-project-rules/04-deployment-agent.md`
- `.ai-project-rules/10-seo-verification-gsc.md`
