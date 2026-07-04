# Opportunity Scout Real-Provider Smoke

Status: operational smoke procedure, not a CI test

This smoke verifies that one opportunity-scout run can travel through the real runtime stack:

```text
API enqueue
-> BullMQ opportunity-scout job
-> worker
-> AiReasoningPort
-> OpenCode Go adapter
-> Zod parse
-> deterministic QA
-> agent_runs terminal state
```

The smoke does not require opportunities to persist. A run that reaches `output_not_json`, `output_schema_mismatch`, or
`qa_rejected` can be a passing smoke when the failure is correctly classified, redacted, and visible in `agent_runs`.

## Preconditions

1. Keep provider secrets outside the repo.
2. Start Postgres and Redis.
3. Apply current DB migrations.
4. Start the API with local scaffold auth enabled.
5. Start the worker with the OpenCode Go env file loaded.

Example env file location:

```powershell
$env:OPENCODE_GO_ENV_FILE='C:\path\outside-repo\localseo-opencode-go.env'
```

The file should contain values such as:

```text
AI_REASONING_PROVIDER=opencode_go
AI_REASONING_MODEL=glm-5.2
AI_REASONING_OPENCODE_GO_API_KEY=...
AI_REASONING_OPENCODE_GO_ENDPOINT=https://opencode.ai/zen/go/v1/chat/completions
AI_REASONING_TIMEOUT_MS=120000
```

Do not commit this file, paste it into docs, or print the key in terminal logs.

## Seed The Fixture

Seed a deterministic persisted project and evidence packet:

```powershell
corepack pnpm tsx tools/seed-opportunity-scout-fixture.ts `
  --env-file $env:OPENCODE_GO_ENV_FILE `
  --reset-scout-state
```

The seed creates:

- project `11111111-1111-4111-8111-111111111111`
- user `00000000-0000-4000-8000-000000000000`
- website import facts for Dachdecker and Entruempelung
- one GSC row and opportunity signal for `entruempelung dachau`
- one manual ranking proof for `dachdecker markt indersdorf`
- one tracking event

The queued scout run writes `maxBriefs` into the stored input packet so the model sees the same cap that QA enforces.

`--reset-scout-state` deletes only opportunity-scout runs, job runs, and opportunities for this smoke project. It leaves the
seeded project and evidence rows in place.

## Start Runtime

Start the API with database, Redis, and local scaffold auth:

```powershell
$env:ALLOW_LOCAL_SCAFFOLD_AUTH='true'
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/local_seo'
$env:REDIS_URL='redis://localhost:6379'
corepack pnpm --filter @localseo/api dev
```

Start the worker in another shell. Load the same DB/Redis env plus the provider env file:

```powershell
$env:ALLOW_LOCAL_SCAFFOLD_AUTH='true'
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

In a third shell:

```powershell
corepack pnpm tsx tools/scout-smoke.ts `
  --env-file $env:OPENCODE_GO_ENV_FILE `
  --api-url http://localhost:4000 `
  --project-id 11111111-1111-4111-8111-111111111111 `
  --user-id 00000000-0000-4000-8000-000000000000 `
  --max-briefs 6
```

The tool enqueues through the public API and polls `agent_runs` by `runId`. It prints only summary fields:

```text
enqueue.status=queued
enqueue.jobId=...
agent_run.status=running
agent_run.status=succeeded
agent_run.failureCode=
agent_run.provider=opencode_go
agent_run.model=glm-5.2
agent_run.latencyMs=...
agent_run.usage={"inputTokens":...,"outputTokens":...,"costCents":...}
agent_run.diagnostics={...}
```

## Passing Outcomes

The smoke passes when all of these are true:

- the run reaches `succeeded` or `failed` through the full queue and worker path,
- the terminal state matches the failure taxonomy,
- provider/model/latency are recorded when the adapter returns,
- usage/cost fields are recorded when the provider supplies them,
- no API key, raw prompt, unredacted provider body, or secret appears in terminal output or `agent_runs`,
- at least one `ok: true` model response is captured before prompt tuning starts, even if QA rejects it.

## Expected Terminal States

```text
succeeded                Best outcome. QA accepted zero or more briefs.
output_not_json          Adapter correctly rejected non-JSON assistant content.
output_schema_mismatch   Adapter returned JSON, but it missed the OpportunityScoutOutput contract.
qa_rejected              Contract parsed, deterministic QA rejected a gate.
provider_timeout         Provider did not answer before timeout.
provider_error           Provider/network failure.
provider_overloaded      Rate limit or temporary capacity failure.
provider_not_configured  Worker was not started with a usable provider key.
```

## Review Artifact

After a real-provider run, create a small Markdown note under `docs/testing/scout-runs/` with:

- date/time,
- provider/model,
- terminal status and failure code,
- whether the taxonomy was correct,
- whether the output was German and locally plausible,
- whether evidence refs were honest,
- whether the next prompt tuning change is required.

Never paste secrets, raw prompts, full model blobs, competitor body text, or customer data dumps into the artifact.
