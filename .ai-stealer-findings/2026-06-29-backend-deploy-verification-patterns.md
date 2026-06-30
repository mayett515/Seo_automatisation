# Backend Deploy And Verification Patterns

Date: 2026-06-29

## Research Scope

Focused Good Artist Inspiration run before implementing the next backend foundation slices:

- deterministic deploy worker,
- real post-deploy verification,
- API/DB/worker integration coverage,
- tracking ingestion hardening,
- Mastra proposal boundary.

The goal was to validate architecture shape, not to copy implementation code.

## Sources

Primary references:

- BullMQ idempotent jobs, job IDs, retries, and graceful shutdown:
  - https://docs.bullmq.io/patterns/idempotent-jobs
  - https://docs.bullmq.io/guide/jobs/job-ids
  - https://docs.bullmq.io/guide/retrying-failing-jobs
  - https://docs.bullmq.io/guide/workers/graceful-shutdown
- Netlify deploy/readback/restore API:
  - https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/
  - https://open-api.netlify.com/
  - https://docs.netlify.com/manage/monitoring/notifications/
- Idempotency and atomic deployment patterns:
  - https://trigger.dev/docs/idempotency
  - https://trigger.dev/docs/deployment/atomic-deployment
  - https://docs.stripe.com/api/idempotent_requests
- Live SEO verification references:
  - https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
  - https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
  - https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
  - https://schema.org/docs/validator.html
- Post-deploy health/check patterns:
  - https://argo-cd.readthedocs.io/en/stable/user-guide/sync-waves/
  - https://argo-cd.readthedocs.io/en/latest/operator-manual/health/
  - https://lychee.cli.rs/guides/cli/
  - https://playwright.dev/docs/actionability
- Public ingestion key and origin references:
  - https://posthog.com/docs/api/capture
  - https://posthog.com/docs/api
  - https://docs.sentry.io/pricing/quotas/manage-event-stream-guide/
  - https://docs.sentry.io/concepts/data-management/filtering/
  - https://amplitude.com/docs/apis/keys-and-tokens
  - https://amplitude.com/docs/apis/analytics/http-v2
  - https://www.rudderstack.com/docs/sources/event-streams/http/
  - https://github.com/dubinc/dub/blob/e6250ae33f60c0dbb07d72ac8efbaa97e72a04da/apps/web/app/(ee)/api/track/click/route.ts
  - https://github.com/dubinc/dub/blob/e6250ae33f60c0dbb07d72ac8efbaa97e72a04da/apps/web/lib/analytics/verify-analytics-allowed-hostnames.ts
  - https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin
  - https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- Mastra and adjacent AI proposal boundary references:
  - https://mastra.ai/docs/agents/structured-output
  - https://mastra.ai/docs/agents/using-tools
  - https://mastra.ai/docs/workflows/overview
  - https://mastra.ai/docs/workflows/suspend-and-resume
  - https://mastra.ai/docs/workflows/human-in-the-loop
  - https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
  - https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data
  - https://nextjs.org/docs/app/guides/data-security
  - https://nextjs.org/docs/app/guides/forms

Local references:

- `docs/architecture/backend-foundation-status.md`
- `docs/architecture/app-blueprint.md`
- `packages/adapters/src/index.ts`
- `packages/ai/src/index.ts`
- `.ai-stealer-catalog/repo-catalog/`

## Adapted Decisions

### Deploy Worker

The deploy worker should be a reconciliation worker, not a one-shot provider call.

Local decision:

- Use a stable `deploymentKey` as the local idempotency authority and likely as the BullMQ `jobId`.
- Store deployment side effects in a local deployment ledger before claiming success.
- On retry, reload local deployment state and provider state before creating another provider deploy.
- Re-check release plan, release checks, persisted approval, rollback evidence, page versions, tracking config, and provider target inside the worker.
- Keep provider DTOs inside a `SiteHostingPort` adapter.
- Never mark a release live from enqueue or provider acceptance.
- For Netlify's async digest deploy flow, create the deploy with path -> SHA1 manifest, poll until Netlify exposes the `required` SHA1 digests, upload those files to `/deploys/{deploy_id}/files/{path}` with `Content-Type: application/octet-stream`, then read/poll deploy state. Only provider state `ready` may map to local provider success; `preparing`, `prepared`, `upload_required`, `accepted`, `queued`, `uploading`, `uploaded`, building, or unknown states must persist a provider deploy id and remain pending for worker reconciliation.
- Netlify's public API docs do not provide a general idempotency-key guarantee for create-deploy calls. The local worker therefore records a provider mutation `in_flight` marker before calling the provider. If a retry sees `in_flight` with no provider deploy id, it must fail closed for manual reconciliation instead of issuing another create call.
- Recorded pending provider deploys need a reconciliation loop beyond one BullMQ execution. BullMQ retries are useful for short transient failures, but provider builds can outlast the retry window; a deterministic worker loop should poll rows with `status = deploying` and `providerDeployId IS NOT NULL`.
- Preflight should require rollback evidence after a prior successful deploy. A first deploy has no prior live provider state to snapshot, so it may pass rollback readiness without a rollback point.
- Local/test artifact handoff may use filesystem storage, but production artifact handoff must use durable object storage through `ObjectStoragePort`.

Recommended port shape:

```text
SiteHostingPort
  createDeploy(artifact, metadata)
  getDeploy(providerDeployId)
  restoreDeploy(providerDeployId)
  rollbackDeploy(input)
```

### Post-Deploy Verification

Post-deploy verification should be observed live evidence, not another preflight.

Local decision:

- Keep preflight as intended-state validation.
- Make verification a deterministic worker/evidence pass after provider deploy readiness.
- Persist append-only verification run rows and child check rows linked to project, release plan, deployment, provider deploy id, and job run.
- Start with bounded HTTP/HTML checks before adding Playwright.
- Return `live_healthy`, `live_with_warnings`, or `rollback_recommended` only from real evidence.

Initial checks:

- HTTP status,
- redirect/final URL,
- HTTPS/certificate failure,
- unexpected `noindex` via meta or `X-Robots-Tag`,
- canonical correctness,
- JSON-LD parse,
- `robots.txt` and sitemap presence/coverage,
- tracking script load when tracking is configured.

### Tracking Ingestion

Browser-exposed tracking keys are publishable write-only identifiers, not secrets.

Local decision:

- Keep project key hashing, revocation, origin allowlists, and exact Origin/Referer matching.
- Treat origin allowlists as browser/leaked-key abuse reduction, not full authentication.
- Add true per-project and per-key buckets before public traffic, beyond per-IP and per-IP/project buckets.
- Coalesce `lastUsedAt` updates to avoid one key-row write per event.
- Add rejection reasons and metrics without logging raw keys.

### Mastra Boundary

Mastra remains a proposal layer and does not change the immediate deploy/verifier priority.

Local decision:

- Keep `@localseo/ai` descriptor-only until deploy and verification are real.
- Do not expose generic controller-facing `workflowId + unknown` as the long-term product API.
- Later, use capability-specific ports such as `proposeWebsiteFacts`, `proposePageComposition`, and `draftReleaseNarrative`.
- Validate Mastra structured outputs with canonical `@localseo/contracts` schemas and a component registry before preview.
- Never let Mastra own deploy, rollback, verification, or direct provider mutations.

## Roadmap Impact

No roadmap reversal.

Updated sequence:

1. Deploy ledger/provider boundary and tracking-rate hardening prerequisites.
2. Idempotent deploy reconciler worker.
3. Productive hosting adapter plus approved artifact handoff.
4. Hosting hardening: async required-file polling/upload, state-aware re-enqueue, first-deploy rollback exemption, and recorded-pending deployment reconciliation.
5. HTTP-first post-deploy verifier.
6. API/DB/worker integration coverage around deploy, verification, tracking, and audit lifecycle.
7. Provider reconciliation polish if Netlify exposes a reliable deployment-key lookup/idempotency path.
8. Mastra creative proposal lane after production truth paths exist.

## Non-Decisions

- Do not implement Mastra creative workflows before deploy/verifier.
- Do not add browser automation to verification until HTTP/HTML checks are insufficient.
- Do not copy implementation code from referenced repositories.
- Do not treat provider `accepted`, `uploaded`, `upload_required`, or `processing` states as live health.

## 2026-06-30 Reconciliation Pattern Synthesis

Additional pattern-mining on lost responses / dangling remote resources refined the Netlify deploy strategy.

Accepted local adaptations:

- Split provider mutation into phases: `beginDeploy -> persist providerDeployId + resume token -> uploadDeployFiles -> getDeploy`.
- Persist the Netlify provider deploy id before file upload.
- Persist provider-specific upload recovery details as opaque deployment evidence, not as domain-level Netlify digest fields.
- Persist local upload completion after successful file upload; retry must not treat provider-neutral `deploying` as proof that upload is done.
- Treat `manual_reconciliation_required` as provider-operation truth when a create call may have happened but no provider deploy id was recorded.
- Use DB state and guarded updates as the crash-safety boundary; retry must not overwrite manual state back to `in_flight`.

Rejected or deferred patterns:

- Do not auto-create a new provider deploy after an `in_flight` lookup returns zero matches. Provider listing can be eventually consistent.
- Do not use Postgres advisory locks across Netlify create/upload/poll I/O.
- Do not automatically delete/cancel provider resources as saga compensation while the remote outcome is unknown.
- Do not add a `recoveryPoint` column, `provider_operations` table, or per-file upload table until multiple provider operations need first-class audit rows.
- Do not use artifact payload hashing as a terminal retry gate while approved artifacts contain volatile metadata such as `createdAt`.

Future lookup rule if implemented:

```text
findDeployByKey may auto-attach only when the provider returns exactly one candidate that matches the persisted operation key,
falls within the provider-mutation time window, and is in an acceptable state.
Zero, multiple, stale, or wrong-state matches stay manual_reconciliation_required.
```
