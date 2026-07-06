# Opportunity Scout Smoke - DeepSeek V4 Flash Schema Mismatch

Date: 2026-07-06

Fixture: synthetic Martines smoke project

## Run

- runId: `4d953af2-b157-4e6c-ace0-c36578b24f75`
- provider: `opencode_go`
- model: `deepseek-v4-flash`
- terminal status: `failed`
- failureCode: `output_schema_mismatch`
- latencyMs: `56161`
- usage: `{"inputTokens":1740,"outputTokens":6128}`
- inputRef: `agent-runs/11111111-1111-4111-8111-111111111111/4d953af2-b157-4e6c-ace0-c36578b24f75/opportunity-scout-input.json`
- persisted opportunity count: `0`
- classification histogram: `{}`

## Outcome

This is a passing infrastructure smoke and a prompt/schema tuning failure:

- API enqueue returned `queued`.
- BullMQ delivered the job to the worker.
- The worker called the real OpenCode Go adapter.
- OpenCode Go returned an `ok: true` JSON response.
- The worker recorded provider, model, latency, usage, and input artifact metadata.
- Zod rejected the output before QA or persistence.
- No opportunity rows were written.

The failure taxonomy is correct: the model returned parseable JSON, but not the `OpportunityScoutOutput` contract, so the run failed with `output_schema_mismatch`.

## Schema Mismatch Summary

The response used a simplified brief shape. The first brief contained fields such as:

```text
id
title
description
query
locations
evidence: string[]
classification
recommendedAction
```

The contract requires full `OpportunityBrief` objects with fields such as:

```text
projectId
service
location
primaryKeyword
suggestedPageType
evidence: EvidenceRef[]
cannibalizationRisk
confidence
```

Representative schema issues:

- `briefs[0].projectId` missing
- `briefs[0].service` missing
- `briefs[0].location` missing
- `briefs[0].primaryKeyword` missing
- `briefs[0].evidence[0]` was a string instead of an `EvidenceRef`
- `briefs[0].cannibalizationRisk` missing
- `briefs[0].confidence` missing
- unrecognized keys: `id`, `title`, `description`, `query`, `locations`

## Prompt-Tuning Implication

The adapter and runtime stack are working. The next tuning pass should make the exact output schema harder to miss:

- include a compact canonical `OpportunityScoutOutput` JSON skeleton in the prompt,
- explicitly say evidence arrays must contain full `EvidenceRef` objects, not source IDs,
- state that `recommendedAction` must use the contract vocabulary, for example `create_brief` instead of `create`,
- keep the existing strict parse/QA behavior unchanged.

No provider secret, raw prompt, packet contents, or real customer data is included in this artifact.
