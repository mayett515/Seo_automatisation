# Opportunity Scout Smoke: OpenCode Go HTTP 401

Date: 2026-07-04

Provider/model: `opencode_go` / requested `glm-5.2`

Run id: `e5e99183-6daf-47f7-8e29-090d36c99649`

Terminal status: `failed`

Failure code: `provider_error`

Diagnostics summary: `detail=http_401`

## Result

The smoke reached the real queue path:

```text
API enqueue
-> Redis/BullMQ opportunity-scout job
-> worker
-> input_ref artifact
-> OpenCode Go adapter
-> agent_runs failed
```

The failure taxonomy was correct: the provider rejected the request before returning model output, so no opportunities were
persisted and the run recorded a redacted provider-layer failure.

## Follow-Up

Prompt tuning is still blocked because this run did not capture an `ok: true` model response. The next attempt needs a valid
OpenCode Go key/subscription for the `https://opencode.ai/zen/go/v1/chat/completions` endpoint.
