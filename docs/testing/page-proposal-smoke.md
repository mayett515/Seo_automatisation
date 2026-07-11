# Page Proposal Real-Provider Smoke

Status: operational smoke harness implemented; credentialed provider runs are manual and intentionally outside CI.

This smoke verifies one Page Proposal run through the real runtime boundary:

```text
API enqueue
-> BullMQ page-generation job
-> Page Proposal worker
-> AiReasoningPort
-> OpenCode Go adapter
-> PageProposalJsonSchema
-> deterministic proposal QA
-> Page Registry validation
-> Page Studio composition validation
-> shared preview render proof
-> draft proposal + unapproved preview version, or a classified failed run with no product rows
```

It does not approve a page, create a release plan, enqueue deploy, or call a production-mutation provider.

## Preconditions

1. Keep provider secrets outside the repository.
2. Start Postgres and Redis and apply current migrations.
3. Stop the API and worker before using the reset flag.
4. Use only the synthetic fixture project defined below.
5. Start the API with local scaffold auth enabled.
6. Start the worker with explicit OpenCode Go configuration.

Example external env-file location:

```powershell
$env:OPENCODE_GO_ENV_FILE='C:\path\outside-repo\localseo-opencode-go.env'
```

The external file should contain:

```text
AI_REASONING_PROVIDER=opencode_go
AI_REASONING_MODEL=glm-5.2
AI_REASONING_OPENCODE_GO_API_KEY=...
AI_REASONING_OPENCODE_GO_ENDPOINT=https://opencode.ai/zen/go/v1/chat/completions
AI_REASONING_TIMEOUT_MS=120000
```

`glm-5.2` is the first Page Proposal quality candidate. The model id remains runtime configuration and never becomes product-contract or database vocabulary.

Do not print, commit, or paste the provider key into a review artifact.

## Seed The Synthetic Fixture

Set the local database URL, then seed while the worker is stopped:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/local_seo'
corepack pnpm tsx tools/seed-page-proposal-fixture.ts `
  --env-file $env:OPENCODE_GO_ENV_FILE `
  --reset-page-proposal-state
```

The seed creates or refreshes:

- project `11111111-1111-4111-8111-111111111111`;
- user `00000000-0000-4000-8000-000000000000`;
- opportunity `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
- one synthetic German `OpportunityBrief` for `dachreinigung muenchen` with internal planning evidence only.

The reset deletes only mutable Page Proposal smoke rows for that opportunity. It refuses to continue if the fixture owns an approved, release-candidate, released, or superseded page version.

## Start The Runtime

Start the API:

```powershell
$env:ALLOW_LOCAL_SCAFFOLD_AUTH='true'
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/local_seo'
$env:REDIS_URL='redis://localhost:6379'
corepack pnpm --filter @localseo/api dev
```

Start the worker in another shell and load the external provider file:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/local_seo'
$env:REDIS_URL='redis://localhost:6379'
Get-Content $env:OPENCODE_GO_ENV_FILE | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
  }
}
corepack pnpm --filter @localseo/worker dev
```

## Run The Smoke

Run from a third shell with the same database URL and external provider file:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/local_seo'
corepack pnpm tsx tools/page-proposal-smoke.ts `
  --env-file $env:OPENCODE_GO_ENV_FILE `
  --api-url http://localhost:4000 `
  --project-id 11111111-1111-4111-8111-111111111111 `
  --user-id 00000000-0000-4000-8000-000000000000 `
  --opportunity-id aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
```

The runner refuses mock/not-configured adapter runs. It prints only bounded summary fields:

```text
enqueue.status=queued
enqueue.jobId=...
agent_run.status=running
agent_run.status=succeeded
agent_run.failureCode=
agent_run.provider=opencode_go
agent_run.model=glm-5.2
agent_run.latencyMs=...
agent_run.inputRef=...
agent_run.usage={...}
agent_run.diagnostics={"gateId":...,"message":...,"detail":...}
page_proposal.count=1
page_proposal.status=draft
page_version.status=preview
page_version.approvedAt=
```

It never prints PageJson, the model prompt, the evidence packet, a provider response body, or credentials.

## Passing Outcomes

The smoke passes when:

- the durable run reaches `succeeded` or a correctly classified `failed` state;
- `agent_runs.provider` is `opencode_go`, proving the worker did not use the mock/not-configured adapter;
- the evidence packet is referenced by `input_ref` rather than printed;
- a failed run has no proposal/version rows attributed to that run;
- a succeeded run has exactly one `draft` proposal and one `preview` version with no `approvedAt`;
- the persisted proposal, page, and initial sections carry worker-owned `generation.source = agent` and the durable run id;
- no raw prompt, secret, provider body, or customer data appears in output or committed artifacts.

An `output_schema_mismatch` or `qa_rejected` result can still prove the real adapter, failure taxonomy, and deterministic gates. At least one credentialed `succeeded` run is required before treating the Page Proposal prompt/model combination as operationally proven.

## Review Artifact

After a credentialed run, create one sanitized note under `docs/testing/page-proposal-runs/` with:

- run id and UTC timestamp;
- provider/model;
- terminal status and failure code;
- QA gate id when present;
- latency and usage/cost summary;
- proposal route and draft/preview status only;
- input-ref key only, not packet contents;
- whether German copy was locally plausible and evidence-grounded;
- whether another prompt/model calibration is needed.

Never commit PageJson output from a real customer, provider bodies, packet contents, prompts, secrets, competitor copy, or chain-of-thought.
