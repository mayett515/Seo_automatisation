# Backend Foundation Status

Current baseline: after the deploy retry hardening, Netlify artifact-handoff baseline, and provider-operation reconciliation hardening following `4cb3c4c` (`Harden deploy retry semantics`).

This page records what the backend foundation now enforces, what is still intentionally incomplete, and where the next serious foundation items sit on the roadmap.

## Current Foundation

```mermaid
flowchart LR
  Web[React control panel] --> Api[NestJS + Fastify API]
  PublicSite[Customer site tracking script] --> Track[POST /track]

  Track --> TrackingGuard[IP/project/key rate limits + project key + origin binding]
  TrackingGuard --> Api

  Api --> Auth[Better Auth session]
  Api --> Guards[CSRF + project access + permission guards]
  Api --> Release[Release module]
  Api --> GSC[GSC OAuth and sync module]
  Api --> TrackingKeys[Tracking key management]

  Auth --> Postgres[(Postgres)]
  Guards --> Postgres
  Release --> Postgres
  GSC --> Postgres
  TrackingKeys --> Postgres

  Api --> Redis[(Redis)]
  Redis --> RateLimits[API/Auth/Tracking rate limits]
  Redis --> OAuthNonce[GSC one-time OAuth nonce]

  Api --> Queues[BullMQ queues]
  Queues --> Worker[Deterministic worker process]
  Worker --> Postgres
  Worker --> External[Google Search Console + provider-neutral hosting port]
```

How to read this: the API owns request authorization and persistence. The public tracking endpoint is not session guarded; its boundary is project-scoped publishable key plus allowed origin plus route-specific rate limiting. Workers execute queued side effects and now update `job_runs`.

## Finished

| Area                      | Status                      | What is enforced                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth/session              | Finished foundation         | Better Auth owns sessions, sessions are DB-durable, Fastify mounts `/api/auth/*`, Nest guards consume session context.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Tenant authorization      | Finished foundation         | Project access resolves before permissions; owner/admin/editor/viewer roles gate privileged actions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| CSRF                      | Finished foundation         | Unsafe authenticated routes are Origin/Referer guarded outside local/test fallback.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| GSC OAuth                 | Finished foundation         | Signed state, PKCE, Redis `GETDEL` nonce, session re-check, project access re-check, encrypted token storage, safe redirect.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| DB ownership              | Finished foundation         | API process uses a shared `DatabaseService` and an executable no-rogue-pool guard.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Redis ownership           | Finished foundation         | API process uses shared error-handled Redis for rate limits/OAuth state/Better Auth secondary storage.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Proxy/rate-limit topology | Finished foundation         | Broad `TRUST_PROXY=true` is rejected in production; Redis-backed rate limits are wired.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Tracking ingestion        | Finished pre-MVP foundation | Per-project publishable keys, hashed storage, create/list/revoke API, owner/admin management, allowed-origin binding, `/track` IP, IP/project, true project, key, and key/project rate limits, explicit dry-run vs persisted result.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Release preflight         | Finished pre-MVP foundation | Preflight reads persisted evidence and fails closed for missing approval, noindex, or local SEO blockers. Rollback evidence is required after a prior successful deploy; first deploys are allowed because there is no prior live deployment to snapshot. QA warnings and tracking readiness are warning-level.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Worker audit lifecycle    | Finished baseline           | Producers create `job_runs` before enqueue, use a DB unique key on stable BullMQ job ID + queue name, coalesce only active/waiting BullMQ jobs, archive terminal audit rows before legitimate re-enqueue, workers prefer `jobRunId` payloads, and jobs mark running, retrying, completed, or failed for real BullMQ jobs. Terminal worker errors are rethrown to BullMQ as unrecoverable failures.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Deploy/verify prep        | Finished prep               | `deployments.deployment_key`, deployment evidence JSON, expanded provider-neutral `SiteHostingPort`, and `release_verification_checks` exist for the deterministic deploy/verifier slices. Migration 0009 backfills existing deployment rows before enforcing `NOT NULL`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Deploy reconciler worker  | Finished baseline           | `deploy()` enqueues real deploy jobs when Redis exists. The worker reloads persisted plan/check/approval/rollback/page-version/hosting evidence, writes or reuses a deployment ledger row by `deployment_key`, writes an approved release artifact, marks provider mutation intent, persists provider IDs and upload resume evidence before file upload, records local upload completion after file upload, and runs a periodic reconciliation loop for recorded pending provider deploys. Transient provider failures stay retryable; pending provider states stay reconcilable; unknown provider-create outcomes are marked `manual_reconciliation_required` instead of being mislabeled as ordinary failed deploys.                                                                                                                                                                                                                                                                                             |
| Hosting adapter           | Baseline wired              | The worker composition root now wires a Netlify digest-deploy adapter when `NETLIFY_AUTH_TOKEN` is present and otherwise keeps the safe `not_configured` adapter. The Netlify adapter exposes phased `beginDeploy` and `uploadDeployFiles` operations, creates an async SHA1 digest deploy with a traceable title, polls until Netlify exposes required file digests, returns an opaque upload resume token, uploads required files as `application/octet-stream`, and returns `ready` only for provider-ready/live state. Production workers use S3-backed `ObjectStoragePort`; local/test workers use filesystem storage.                                                                                                                                                                                                                                                                                                                                                                                        |
| Post-deploy verification  | Baseline wired              | `verify()` now loads a provider-succeeded deployment, derives intended live routes from the preferred stable production URL and release plan item routes, runs a deterministic HTTP verifier, persists `release_verifications` plus child `release_verification_checks`, and updates deployment verification/health status from observed evidence. The baseline checks HTTP success, noindex, canonical URL, JSON-LD parseability, exact sitemap `<loc>` inclusion, and tracking marker presence when tracking is configured. The renderer emits approved canonical and JSON-LD fields so the baseline deploy artifact and verifier agree. `releasePlans.status` is only a coarse release-level projection; a verification failure maps it to `failed` so UI/reporting cannot overclaim `live`, but the exact reason lives in `deployments`, `release_verifications`, and `release_verification_checks`. Browser-level checks, GSC handoff, rollback execution, and DB integration coverage remain follow-up work. |
| Frontend auth UX          | Finished baseline           | Login/sign-up/sign-out, session gate, credentialed API fetches, explicit local scaffold bypass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Mastra slot               | Reserved baseline           | `@localseo/ai` contains workflow/agent descriptors, but the product workflows for site planning and creative assembly are not integrated yet and are not loaded by the worker.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Release Flow State

```mermaid
stateDiagram-v2
  [*] --> Draft: create release plan
  Draft --> Blocked: preflight blockers
  Draft --> Ready: preflight passed
  Draft --> ReadyWithWarnings: warnings only
  Ready --> ApprovedForDeploy: customer approval persisted
  ReadyWithWarnings --> ApprovedForDeploy: customer approval persisted
  ApprovedForDeploy --> Deploying: deploy job enqueued
  Deploying --> Live: deploy reconciler gets provider success
  Deploying --> Failed: deploy worker fails
  Live --> LiveHealthy: real verification passes
  Live --> LiveWithWarnings: real verification warnings
  Live --> RollbackRecommended: verification blocker
  RollbackRecommended --> RolledBack: rollback worker executes

  note right of Deploying
    Reconciler worker exists.
    Netlify adapter baseline exists.
    Recorded pending provider deploys
    are also polled by a worker loop.
    If provider create may have happened
    but no providerDeployId was recorded,
    providerOperationStatus becomes
    manual_reconciliation_required and
    automation stops.
    Default adapter still fails as
    not_configured when credentials
    are absent.
  end note

  note right of ApprovedForDeploy
    If Redis is absent, deploy()
    still returns explicit dry_run.
    If Redis exists, a real job is
    enqueued and audited.
  end note

  note right of Live
    verify() now runs HTTP-first
    checks and persists evidence.
    Browser/GSC/rollback depth and
    integration coverage are still
    required before production deploys.
  end note
```

How to read this: the preflight, approval, deploy enqueue, deploy worker, and HTTP-first verification state transitions are now real enough to trust as backend control flow. Productive hosting has a Netlify adapter baseline, approved-artifact handoff, async required-file upload handling, persisted provider IDs before upload, a recorded-pending-deploy reconciler, and persisted post-deploy verification evidence. It is still not production-complete because integration coverage is still mostly unit-level, rollback execution is still stubbed, browser-level tracking/script checks are not wired, and the tiny provider-create window before provider ID persistence still escalates to manual reconciliation rather than automatic lookup.

Important UI/reporting interpretation: `releasePlans.status = "failed"` is a coarse "do not present this release as healthy/live" projection. It can mean the provider deploy failed, or it can mean the provider deploy succeeded but post-deploy verification found a blocker and wrote `deployments.status = "rollback_recommended"` or `deployments.verificationStatus = "failed"`. UI, reports, release notes, and customer-facing explanations must read the deployment and verification detail rows before explaining why a release is failed or rollback-recommended.

## Next Serious Foundation Items

### 1. Foundation Integration Coverage

Meaning: prove the assembled foundation through API/DB/worker paths rather than isolated unit tests.

High-value items:

- API/DB-backed tracking ingestion tests for valid key, revoked key, wrong origin, malformed IDs, and route limit behavior.
- Release state-machine tests for create, preflight, approve, deploy queueing, cross-project rejection, and non-approvable statuses.
- Queue producer tests proving stable job IDs reuse one `job_runs` row under duplicate enqueue races.
- Worker audit tests proving `jobRunId` lifecycle updates, enqueue-failure audit failure, and zero-row warnings.
- Deploy worker retry tests proving transient provider failures stay retryable and pending provider states remain reconcilable instead of being downgraded to failed only because the BullMQ retry window ended.
- Deploy adapter integration tests proving approved artifact handoff, provider pending reconciliation, and no duplicate provider mutation after an in-flight marker.
- Release verification integration tests proving live route checks persist verification rows, child check rows, deployment verification status, and rollback recommendation status from real evidence.
- GSC sync retry test proving delete+insert analytics mutation is transactional.
- Login/session browser smoke for unauthenticated redirect, sign-in, protected route access, and sign-out.

### 2. Productive Hosting Follow-Up

Meaning: keep the newly wired Netlify adapter/artifact handoff production-operable as verification and integration tests land. This work still must not rely on AI reasoning during execution.

Required behavior:

- Keep `SiteHostingPort` provider-neutral; Netlify details stay inside the adapter.
- Keep production artifact storage on durable object storage (`S3_BUCKET`); keep filesystem storage local/test only.
- Keep the approved release artifact writer and provider adapter on the shared `ObjectStoragePort`.
- Keep Netlify async digest deploys in the poll-until-required-digests flow before file upload.
- Keep deploy jobs on the longer fixed retry window so provider-ready polling has real time to complete.
- Keep the periodic reconciler for deployments that already have `providerDeployId` recorded.
- Keep upload resume controlled by local upload-complete evidence, not provider-neutral `deploying` state.
- Publish only approved page versions.
- Inject/verify the project tracking snippet only from approved tracking config.
- Continue to validate rollback artifacts before productive mutation.
- Preserve deployment ledger idempotency by `deployment_key`.
- Keep provider-operation state typed and guarded; `manual_reconciliation_required` must stop automation and must not be overwritten back to `in_flight`.
- Keep the provider mutation in-flight marker fail-closed: a retry must not create another provider deploy when a provider call may have succeeded but no provider deploy id was recorded.
- If Netlify exposes a reliable provider-side idempotency or metadata lookup path later, replace manual reconciliation with automatic provider lookup only when the match is exact, time-windowed, state-filtered, and non-ambiguous.
- Keep `ready` deploy results limited to provider-ready/live state; accepted, uploaded, queued, or building provider states must remain pending and be reconciled with `getDeploy`.
- Keep default `not_configured` behavior for environments without provider credentials.
- Keep HTTP-first verification as the baseline and add browser-level script checks only when HTTP/HTML evidence is insufficient.

Definition of done:

```text
approved_for_deploy + passing checks
-> queued deploy job
-> deterministic worker reloads persisted evidence
-> provider adapter executes hosting mutation
-> deployment row has providerDeployId/liveUrl
-> release status reflects provider side effect
-> retry after provider-created crash either resumes from recorded providerDeployId or stops at manual_reconciliation_required instead of creating a duplicate provider deploy
-> verify endpoint persists live evidence and updates deployment health
```

## Mastra Reasoning And Creative Assembly Lane

Mastra is a first-class product lane, but it is not the production side-effect authority.

```mermaid
flowchart LR
  Import[Website import and field facts] --> Facts[Structured brand, service, area, design facts]
  Facts --> Mastra[Mastra reasoning workflows and agents]
  Mastra --> Proposal[Structured proposals]

  Proposal --> Contracts[Zod output contracts]
  Contracts --> Registry[Component registry and prop schemas]
  Registry --> QA[Deterministic SEO/design QA]
  QA --> Preview[Preview and edit UI]
  Preview --> Approval[Human/customer approval]
  Approval --> Release[Release preflight]
  Release --> Worker[Deterministic deploy worker]

  Mastra -. never directly deploys .-> Worker
```

How to read this: Mastra proposes strategy, content, layout, and design choices. Contracts, registries, deterministic QA, preview, approval, and workers decide what is valid and what is allowed to mutate production.

### Mastra Lane Status

| Slice                             | Status  | Purpose                                                                                                                           |
| --------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| AI reasoning port                 | Planned | Define the application interface for invoking Mastra without leaking agent/provider details into controllers or core packages.    |
| Website understanding workflow    | Planned | Convert imported website evidence into structured business, service, area, tone, color, layout, and CTA facts.                    |
| Component registry                | Planned | Define which frontend/site components Mastra may choose, including prop schemas and allowed style/theme tokens.                   |
| Page proposal workflow            | Planned | Produce route, page purpose, sections, component props, draft copy, metadata, schema, FAQ, CTA, and internal-link suggestions.    |
| Validation pipeline               | Planned | Validate every Mastra output with Zod, component prop schemas, local SEO QA, duplicate/cannibalization checks, and policy guards. |
| Preview and approval UI           | Planned | Render structured proposals for editing, notes, and persisted approval before release.                                            |
| Release/report narrative workflow | Planned | Draft release notes and customer-safe report language; deterministic guards block forbidden proof claims.                         |

### Mastra Can Suggest

- main-domain and subdomain/local-page structure,
- service/area page strategy,
- page hierarchy and internal links,
- component/section composition,
- copy for main-domain and local pages,
- title/meta/schema/FAQ/CTA drafts,
- design tone, colors, and theme hints from the imported website,
- release explanations,
- customer-safe report narrative.

### Mastra Must Not Own

- customer approval,
- release status truth,
- deploy execution,
- rollback execution,
- live health verification,
- direct provider/hosting mutations,
- unvalidated arbitrary frontend code generation.

Preferred output shape:

```text
website facts
-> Mastra structured proposal
-> schema/component validation
-> deterministic QA
-> preview
-> approval
-> release/deploy/verify
```

The key implementation rule is: Mastra outputs structured proposals, not arbitrary React/site code strings.

## Backend Foundation Readiness

Programming-wise, the backend foundation is set for continued product build and architecture review. The core security and tenancy surfaces are no longer scaffolding:

- session identity is real,
- tenant authorization is real,
- GSC OAuth is real,
- tracking ingestion has a real boundary,
- release preflight is evidence-backed,
- DB/Redis ownership is consolidated,
- worker jobs have baseline lifecycle audit.

It is not yet set for production deploys. The deploy reconciler worker, approved-artifact handoff, durable production artifact storage, Netlify adapter baseline, typed provider-operation state, manual reconciliation stop state, and HTTP-first verification baseline now exist, but rollback execution, browser-level script checks, GSC handoff, and API/DB/worker integration coverage still need to land. The Mastra creative assembly lane is also not product-integrated yet; it is planned as the proposal layer for site strategy, copy, layout, and design, not as an execution bypass. Until integration coverage and recovery paths are done, deploy success and live health must not be treated as customer-safe production facts.

## Pattern Mining Checkpoint

A targeted pattern-mining run was recorded in `.ai-stealer-findings/2026-06-29-backend-deploy-verification-patterns.md`. The useful research question was narrow:

```text
How do production TypeScript web apps wire:
- Next.js or React frontends,
- Fastify or Nest/Fastify APIs,
- queue workers,
- DB-backed audit/status rows,
- deploy/release verification flows,
- public browser tracking keys,
- Mastra-style reasoning workflows that produce structured site/content/layout proposals?
```

Best sources are likely official docs and close production repos, not broad big-data catalogs. The strongest comparison targets are apps with:

- a React/Next.js control plane,
- an API/worker split,
- provider adapters,
- job audit tables,
- deployment or publishing flows,
- public ingestion keys or webhook-style trust boundaries.
- AI/agent proposal workflows separated from deterministic execution.

The goal was not to reopen product decisions. The goal was to validate the remaining foundation items before implementing deploy, verification, and the Mastra proposal pipeline.
