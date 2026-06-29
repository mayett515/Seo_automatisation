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
3. HTTP-first post-deploy verifier.
4. API/DB/worker integration coverage around deploy, verification, tracking, and audit lifecycle.
5. Mastra creative proposal lane after production truth paths exist.

## Non-Decisions

- Do not implement Mastra creative workflows before deploy/verifier.
- Do not add browser automation to verification until HTTP/HTML checks are insufficient.
- Do not copy implementation code from referenced repositories.
- Do not treat provider `accepted`, `uploaded`, or `processing` states as live health.
