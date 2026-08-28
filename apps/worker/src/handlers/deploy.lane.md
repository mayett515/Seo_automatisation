---
lane: deploy
domain: release
state: built
missing: []
reason: ""
trigger: ""
proof: apps/worker/src/handlers/deploy.integration.ts
---

## Is

- **D1, D2** → `packages/domain/src/index.ts:deployStartingReleasePlanStatuses`.
  The worker re-reads the plan and gates on that set before starting the ledger
  row — confirming the commitment still stands, not re-deciding it.
- **D2, G3** → `packages/domain/src/index.ts:deployStartingReleasePlanStatuses`.
  The state set has one owner, and both ends import it. Change one side only
  together with the other.
- **D3** → `apps/api/src/queue-producer.ts:QueueProducerService` (`enqueue`, the
  serialized per-`(queueName, jobId)` advisory-lock path). The job id is derived
  from the release plan id. Not the admission reads in
  `apps/api/src/modules/releases/release-execution.capability.ts:ReleaseExecutionCapability`
  — those are three separate statements and are not atomic.
- **D4** → this lane produces `release-verification-request` and never a health
  claim. Enforced by omission, which is why it is stated here.
- **G2** → the API's conditional status update runs after the enqueue, so its
  `BadRequestException` can be raised while a job is already queued. What keeps
  the reported outcome honest is the worker's own gate, not the ordering in the
  API.

## Is not

- Does not decide **whether** a release may deploy. Preflight and deploy
  approval own that (`apps/api/src/modules/releases/release-preflight.capability.ts:ReleasePreflightCapability`).
- Does not establish that the site is live and healthy — see D4. The
  `release-verification` lane owns that claim.
- Does not undo a deployment, and does not decide that one should be undone. The
  `rollback` lane executes; the decision stays manual, because ADR 0014 keeps
  automatic rollback behind explicit opt-in gates.
