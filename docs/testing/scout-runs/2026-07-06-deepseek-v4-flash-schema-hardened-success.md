# Opportunity Scout Smoke - DeepSeek V4 Flash Schema-Hardened Success

Date: 2026-07-06

Fixture: synthetic Martines smoke project

## Run

- runId: `507c7b57-29d9-4d0f-8594-62986d6e832b`
- provider: `opencode_go`
- model: `deepseek-v4-flash`
- terminal status: `succeeded`
- failureCode: none
- latencyMs: `48776`
- usage: `{"inputTokens":3190,"outputTokens":6526}`
- inputRef: `agent-runs/11111111-1111-4111-8111-111111111111/507c7b57-29d9-4d0f-8594-62986d6e832b/opportunity-scout-input.json`
- persisted opportunity count: `2`
- classification histogram: `{"proven_win":1,"near_term_target":1}`

## Outcome

This is the first successful real-provider Opportunity Scout run on the deterministic Martines fixture after prompt schema hardening.

The run traversed:

```text
API enqueue
-> BullMQ opportunity-scout job
-> worker
-> OpenCode Go adapter
-> Zod parse
-> deterministic QA
-> transactional opportunity persistence
```

The worker persisted two opportunities:

| Classification     | Service       | Location         | Keyword                       | Action         | Score |
| ------------------ | ------------- | ---------------- | ----------------------------- | -------------- | ----- |
| `proven_win`       | Dachdecker    | Markt Indersdorf | `dachdecker markt indersdorf` | `monitor`      | `100` |
| `near_term_target` | Entruempelung | Dachau           | `entruempelung dachau`        | `create_brief` | `45`  |

Evidence tiers stayed within the MVP proof policy:

| Keyword                       | Evidence sourceTypes | Proof tiers           |
| ----------------------------- | -------------------- | --------------------- |
| `dachdecker markt indersdorf` | `ranking_proof`      | `customer_safe_proof` |
| `entruempelung dachau`        | `gsc_row`            | `internal_signal`     |

## Tuning Notes

The previous clean fixture rerun after adding the schema example failed only on `suggestedRoute: null`. The prompt was tightened with:

```text
Never output null. Omit optional fields when unknown, and use empty arrays only where the example shows arrays.
```

The next run succeeded. This confirms the main issue was prompt/schema discipline, not adapter wiring or QA strictness.

Input tokens increased from `1740` on the pre-skeleton run to `3190` after the canonical example and enum vocabulary were embedded. That is acceptable for this smoke fixture and remains within the packet budget.

## Review Notes

- No raw prompt, packet contents, provider body, API key, or real customer data is included.
- The output was German/local-SEO plausible at the summary level.
- The `proven_win` row stayed tied to reviewed manual ranking proof.
- The GSC-only Dachau opportunity did not become customer-safe proof.
- Zod and deterministic QA remained strict; no normalization layer or lenient pre-parser was added.
