---
lane: release-verification
domain: release
state: built
missing: []
reason: ""
trigger: ""
proof: apps/worker/src/handlers/release-verification.integration.ts
---

## Is

- **D4** -> this is the lane that owns the claim "the site is live and healthy".
  Nothing upstream may make it, and a completed deploy is not evidence of it.
- **G1** -> the check produces evidence a report may cite, including the
  inverse test: a live route that is blocked by `noindex` is a failure, not a
  pass (`packages/adapters/src/http-release-verification.ts:HttpReleaseVerificationAdapter`,
  the `indexability_check`). The plan required staging to be noindex; this lane
  also proves production is not.
- **G2** -> a verification that could not run is recorded as unverified rather
  than as healthy.

## Is not

- Does not deploy or roll back. It observes and records.
- Does not decide that a bad result means rollback. That decision stays with a
  human, per ADR 0014.
