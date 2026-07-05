# Opportunity Scout Smoke: OpenCode Go HTTP 401

Date: 2026-07-04

Branch: `mvp/opportunity-scout-real-provider-smoke`

Provider/model: `opencode_go` / requested `glm-5.2`

Run id: `e5e99183-6daf-47f7-8e29-090d36c99649`

Terminal status: `failed`

Failure code: `provider_error`

Diagnostics summary: `detail=http_401`

Latency/usage summary: not recorded in artifact

Persisted brief count: `0`

Classification histogram: `{}`

Input ref: created but not recorded in artifact

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

Historical note: this run happened before HTTP 401/403 provider auth and entitlement failures were mapped to terminal
`provider_not_configured`. The same provider response should now avoid BullMQ retries and fail the scout lane as unusable
provider configuration.

## Follow-Up

Prompt tuning is still blocked because this run did not capture an `ok: true` model response. The next attempt needs a valid
OpenCode Go key/subscription for the `https://opencode.ai/zen/go/v1/chat/completions` endpoint and should use the current
first-smoke model choice, `deepseek-v4-flash`.
