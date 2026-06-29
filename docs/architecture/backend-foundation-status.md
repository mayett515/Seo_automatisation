# Backend Foundation Status

Current baseline: after the deterministic deploy reconciler slice following `bed5f63` (`Tighten deploy prep cleanup`).

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

| Area                      | Status                      | What is enforced                                                                                                                                                                                                                                                                |
| ------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth/session              | Finished foundation         | Better Auth owns sessions, sessions are DB-durable, Fastify mounts `/api/auth/*`, Nest guards consume session context.                                                                                                                                                          |
| Tenant authorization      | Finished foundation         | Project access resolves before permissions; owner/admin/editor/viewer roles gate privileged actions.                                                                                                                                                                            |
| CSRF                      | Finished foundation         | Unsafe authenticated routes are Origin/Referer guarded outside local/test fallback.                                                                                                                                                                                             |
| GSC OAuth                 | Finished foundation         | Signed state, PKCE, Redis `GETDEL` nonce, session re-check, project access re-check, encrypted token storage, safe redirect.                                                                                                                                                    |
| DB ownership              | Finished foundation         | API process uses a shared `DatabaseService` and an executable no-rogue-pool guard.                                                                                                                                                                                              |
| Redis ownership           | Finished foundation         | API process uses shared error-handled Redis for rate limits/OAuth state/Better Auth secondary storage.                                                                                                                                                                          |
| Proxy/rate-limit topology | Finished foundation         | Broad `TRUST_PROXY=true` is rejected in production; Redis-backed rate limits are wired.                                                                                                                                                                                         |
| Tracking ingestion        | Finished pre-MVP foundation | Per-project publishable keys, hashed storage, create/list/revoke API, owner/admin management, allowed-origin binding, `/track` IP, IP/project, true project, key, and key/project rate limits, explicit dry-run vs persisted result.                                            |
| Release preflight         | Finished pre-MVP foundation | Preflight reads persisted evidence and fails closed for missing approval, noindex, local SEO blockers, or rollback point. QA warnings and tracking readiness are warning-level.                                                                                                 |
| Worker audit lifecycle    | Finished baseline           | Producers create `job_runs` before enqueue, workers prefer `jobRunId` payloads, and jobs mark running, completed, or failed for real BullMQ jobs.                                                                                                                               |
| Deploy/verify prep        | Finished prep               | `deployments.deployment_key`, deployment evidence JSON, expanded provider-neutral `SiteHostingPort`, and `release_verification_checks` exist for the deterministic deploy/verifier slices. Migration 0009 backfills existing deployment rows before enforcing `NOT NULL`.       |
| Deploy reconciler worker  | Finished baseline           | `deploy()` enqueues real deploy jobs when Redis exists. The worker reloads persisted plan/check/approval/rollback evidence, writes or reuses a deployment ledger row by `deployment_key`, calls `SiteHostingPort`, and updates release/deployment status on success or failure. |
| Hosting adapter           | Not production-configured   | The default `NotConfiguredSiteHostingAdapter` returns `not_configured`, so deploy jobs fail truthfully until a Netlify or equivalent adapter and approved build artifact handoff are wired.                                                                                     |
| Frontend auth UX          | Finished baseline           | Login/sign-up/sign-out, session gate, credentialed API fetches, explicit local scaffold bypass.                                                                                                                                                                                 |
| Mastra slot               | Reserved baseline           | `@localseo/ai` contains workflow/agent descriptors, but the product workflows for site planning and creative assembly are not integrated yet and are not loaded by the worker.                                                                                                  |

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
    Default hosting adapter fails
    as not_configured until a
    production adapter is wired.
  end note

  note right of ApprovedForDeploy
    If Redis is absent, deploy()
    still returns explicit dry_run.
    If Redis exists, a real job is
    enqueued and audited.
  end note

  note right of Live
    verify() is still synthetic today.
    Real post-deploy verification must
    exist before production deploys.
  end note
```

How to read this: the preflight, approval, deploy enqueue, and deploy worker state transitions are now real enough to trust as backend control flow. Productive hosting is not yet production-complete because the default hosting adapter is intentionally `not_configured`, and post-deploy verification is still synthetic.

## Next Serious Foundation Items

### 1. Productive Hosting Adapter And Artifact Handoff

Meaning: connect the existing deterministic deploy reconciler to a real provider adapter and approved release artifact. This work still must not rely on AI reasoning during execution.

Required behavior:

- Keep `SiteHostingPort` provider-neutral; Netlify details stay inside the adapter.
- Build or load the approved release artifact referenced by the deploy worker.
- Wire a Netlify adapter or equivalent provider adapter into the worker composition root.
- Publish only approved page versions.
- Inject/verify the project tracking snippet only from approved tracking config.
- Continue to validate rollback artifacts before productive mutation.
- Preserve deployment ledger idempotency by `deployment_key`.
- Keep default `not_configured` behavior for environments without provider credentials.

Definition of done:

```text
approved_for_deploy + passing checks
-> queued deploy job
-> deterministic worker reloads persisted evidence
-> provider adapter executes hosting mutation
-> deployment row has providerDeployId/liveUrl
-> release status reflects provider side effect
```

### 2. Real Post-Deploy Verification

Meaning: replace the current synthetic `verify()` response with deterministic checks against live deployment evidence.

Required behavior:

- Fetch each intended live route.
- Check HTTP success status.
- Confirm live pages are not blocked by `noindex`.
- Check canonical URL and trailing slash expectations.
- Parse structured data enough to catch invalid JSON-LD/schema output.
- Confirm sitemap readiness/publication state when relevant.
- Confirm tracking script loads where tracking is configured.
- Persist `release_verifications`, child `release_verification_checks`, and update deployment verification status.
- Return `live_healthy`, `live_with_warnings`, or `rollback_recommended` only from real evidence.

Definition of done:

```text
deployed release
-> live route checks
-> persisted verification row
-> deployment/release status updated from evidence
-> rollback recommended when blockers exist
```

### 3. Foundation Integration Coverage

Meaning: prove the assembled foundation through API/DB/worker paths rather than isolated unit tests.

High-value items:

- API/DB-backed tracking ingestion tests for valid key, revoked key, wrong origin, malformed IDs, and route limit behavior.
- Release state-machine tests for create, preflight, approve, deploy queueing, cross-project rejection, and non-approvable statuses.
- Worker audit tests proving `jobRunId` lifecycle updates, enqueue-failure audit failure, and zero-row warnings.
- GSC sync retry test proving delete+insert analytics mutation is transactional.
- Login/session browser smoke for unauthenticated redirect, sign-in, protected route access, and sign-out.

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

It is not yet set for production deploys. The deploy reconciler worker exists, but productive hosting still needs a real provider adapter/artifact handoff, and live health still needs real post-deploy verification. The Mastra creative assembly lane is also not product-integrated yet; it is planned as the proposal layer for site strategy, copy, layout, and design, not as an execution bypass. Until provider deploy and verification are done, deploy success and live health must not be treated as customer-safe production facts.

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
