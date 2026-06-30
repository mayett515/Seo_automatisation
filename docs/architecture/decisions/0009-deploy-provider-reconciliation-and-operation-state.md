# 0009 - Deploy Provider Reconciliation And Operation State

Date: 2026-06-30
Status: Accepted

## Context

The Netlify adapter introduced a real provider mutation into the deploy worker. Review and pattern-mining runs identified the core failure mode as a lost response / dangling remote resource problem: Postgres and Netlify cannot be updated in one transaction, and Netlify does not provide a native create-deploy idempotency key.

The previous guard wrote `provider_operation_status = in_flight` before calling Netlify and failed closed if a retry saw `in_flight` without a `providerDeployId`. That avoided duplicate provider creates, but it still recorded the deployment as ordinary `failed`, which can be false if Netlify actually accepted the create call.

## Decision

Use `provider_operation_status` as the typed provider-operation lifecycle vocabulary:

```text
not_started
in_flight
recorded
failed
manual_reconciliation_required
```

The deploy worker now treats `manual_reconciliation_required` as a terminal stop sign for automation. A retry must not overwrite it back to `in_flight` and must not create another provider deploy.

Split provider deploy execution into phases:

```text
beginDeploy -> persist providerDeployId + opaque resume token -> uploadDeployFiles -> getDeploy/reconcile
```

The provider adapter owns provider-specific upload details. The worker only persists an opaque resume token in deployment evidence so a retry can resume upload after the provider ID is recorded. For Netlify, that token currently contains the required file digests, but that detail must not leak into shared domain contracts.

After `uploadDeployFiles` succeeds, the worker persists a local provider upload marker and clears the resume token. Retry and reconciliation paths use that local marker, not Netlify's coarse provider status, to decide whether file upload still needs to be resumed. This is intentional because Netlify states such as `uploading`, `uploaded`, `building`, and `processing` collapse to provider-neutral `deploying`, but only some of those states are safe reasons to skip upload.

If a retry sees `in_flight` without a `providerDeployId`, the worker marks `provider_operation_status = manual_reconciliation_required` and stops. It does not auto-create another deploy. The same manual state is used when provider begin fails after the in-flight marker or when the provider deploy id cannot be persisted after begin succeeds.

## Consequences

What becomes safer:

- The crash window after Netlify returns a provider deploy ID is narrowed because the ID is persisted before file upload.
- Mid-upload crashes can resume from the persisted upload token instead of rediscovering Netlify's required files.
- Reconciliation avoids treating provider-neutral `deploying` as proof that uploads completed; local upload-complete evidence owns that decision.
- Unknown provider outcomes are no longer mislabeled as ordinary deployment failures.
- Manual reconciliation state is protected both by worker checks and DB update guards.

Costs and follow-up:

- There is still a residual window between setting `in_flight` and recording `providerDeployId`; today that includes Netlify required-file polling inside `beginDeploy`. This intentionally goes to manual reconciliation until a safe lookup path is implemented.
- `findDeployByKey` remains a future enhancement, and any such lookup must be exactly-one, time-windowed, state-filtered, and must never treat zero matches as proof that create did not happen.
- Real post-deploy verification remains required before deploy success is customer-safe.

## Alternatives Considered

### Use `deployments.status = manual_reconciliation_required`

Rejected for this slice. The manual state describes provider operation uncertainty, not customer-facing deployment readiness. The provider-operation enum is the narrower source of truth, provided the worker and repository guard against overwriting it.

### Auto-Recreate When Lookup Finds No Provider Deploy

Rejected. Netlify listing and read-after-write behavior can be eventually consistent. A zero-match lookup is not proof the create request failed.

### Postgres Advisory Locks Across Provider Calls

Rejected. Holding a DB connection while Netlify creates, uploads, and polls would trade a duplicate-create risk for pool starvation. Row state and guarded updates are the right tool here.

### Recovery Point Column Or Provider Operations Table

Deferred. The phase is currently derivable from `provider_operation_status`, `providerDeployId`, deployment status, and evidence JSON. A separate table becomes useful only when multiple provider operations per deployment need first-class audit rows.

### Automatic Provider Compensation

Rejected. The worker must not delete or cancel provider resources automatically while the system is uncertain whether they are live or customer-visible.

## Regression Guard

- Do not call provider create when `provider_operation_status = manual_reconciliation_required`.
- Do not overwrite manual reconciliation evidence through `startDeployment`, `markProviderMutationInFlight`, or failure handling.
- Do not mark provider `accepted`, `upload_required`, `uploading`, `building`, or `queued` as live health.
- Do not expose Netlify digest protocol details as domain or contract-level fields.
- Do not use provider-neutral `deploying` alone to skip upload resume; require local upload-complete evidence.
- Do not implement retry loops around provider create unless the retry has an idempotency key or a duplicate guard.

## Related Files

- `packages/contracts/src/index.ts`
- `packages/db/src/schema.ts`
- `packages/db/migrations/0012_loose_synch.sql`
- `packages/adapters/src/index.ts`
- `packages/adapters/src/netlify-site-hosting.ts`
- `apps/worker/src/handlers/deploy.ts`
- `.ai-project-rules/04-deployment-agent.md`
- `.ai-rules/04C-async-failure-cancellation-resilience.md`
