# Opportunity Scout Model Comparison - DeepSeek V4 Flash vs Pro

Date: 2026-07-06

Fixture: synthetic Martines smoke project

Purpose: compare schema/QA compliance, latency, token shape, and local-SEO plausibility after the canonical
`OpportunityScoutOutput` prompt example landed.

## Method

Each run used the deterministic Martines fixture:

```text
projectId: 11111111-1111-4111-8111-111111111111
maxBriefs: 6
provider: opencode_go
models: deepseek-v4-flash, deepseek-v4-pro
```

Before each run, `tools/seed-opportunity-scout-fixture.ts --reset-scout-state` reset opportunity-scout runs,
job runs, and opportunities for the fixture project.

This preserves comparable inputs but means the database retains only the final run's detailed rows. The table below
comes from terminal-safe smoke logs; detailed content review uses the earlier Flash success artifact and the final Pro
persisted rows.

## Run Summary

| Model               | Run | Status      | Failure | Latency ms | Input tokens | Output tokens | Opportunities | Histogram                               |
| ------------------- | --- | ----------- | ------- | ---------- | ------------ | ------------- | ------------- | --------------------------------------- |
| `deepseek-v4-flash` | 1   | `succeeded` | none    | 68010      | 3190         | 8644          | 2             | `{"proven_win":1,"near_term_target":1}` |
| `deepseek-v4-flash` | 2   | `succeeded` | none    | 56732      | 3190         | 7834          | 2             | `{"proven_win":1,"near_term_target":1}` |
| `deepseek-v4-flash` | 3   | `succeeded` | none    | 66386      | 3190         | 9229          | 2             | `{"proven_win":1,"near_term_target":1}` |
| `deepseek-v4-pro`   | 1   | `succeeded` | none    | 142258     | 3190         | 11656         | 2             | `{"proven_win":1,"near_term_target":1}` |
| `deepseek-v4-pro`   | 2   | `succeeded` | none    | 145535     | 3190         | 9729          | 2             | `{"proven_win":1,"near_term_target":1}` |
| `deepseek-v4-pro`   | 3   | `succeeded` | none    | 138075     | 3190         | 9318          | 2             | `{"proven_win":1,"near_term_target":1}` |

Average:

```text
deepseek-v4-flash  success 3/3, avg latency 63709 ms, avg output 8569 tokens
deepseek-v4-pro    success 3/3, avg latency 141956 ms, avg output 10234 tokens
```

## Representative Output Review

Both models consistently produced the same product shape:

```text
proven_win       Dachdecker / Markt Indersdorf / dachdecker markt indersdorf / monitor
near_term_target Entruempelung / Dachau / entruempelung dachau / create_brief
```

The final Pro run persisted:

- `proven_win` only from the reviewed manual `ranking_proof`, with rank 4, query, and page URL matching the row.
- `near_term_target` from GSC demand evidence only, with `internal_signal` proof tier and missing evidence explaining that
  ranking proof is needed before any proven-win claim.
- `entruempelung dachau` as a page-brief candidate, not a page proposal or deployable page.
- `cannibalizationRisk.level = medium` for the Dachau opportunity because the generic `/entruempelung/` route conflicts.

This matches the accepted product boundary: the model can propose a brief, but it cannot publish, deploy, or turn GSC into
customer-safe proof.

## Field-Evidence Calibration

The review criteria come from the read-only Martines field planning files:

```text
C:/gebäudeservicefirma/Seo/future-seo-growth-plan/02-growth-roadmap.md
C:/gebäudeservicefirma/Seo/future-seo-growth-plan/03-keyword-map.md
```

Useful distilled rules:

- protect proven Dach/Spengler rankings before expansion,
- keep weak opportunity terms out of customer-facing wins,
- require a real service fit and unique local reason before a new page exists,
- prefer cluster/corridor expansion over random city-page sprawl,
- never treat Entruempelung opportunity terms as proven Dach/Spengler wins.

## Interpretation

`deepseek-v4-flash` is the better current default for Opportunity Scout smoke and cheap repeated scout runs:

- schema compliance was 3/3 after prompt hardening,
- classification histogram matched Pro on all runs,
- latency was less than half of Pro in this fixture,
- output was sufficient for the current evidence and QA gates.

`deepseek-v4-pro` is not rejected. It is still the fallback candidate when:

- Flash starts failing schema/QA on richer packets,
- the opportunity packet contains more technical-audit evidence,
- search/SERP orchestration requires deeper reasoning,
- qualitative review shows Flash is too shallow on German local-SEO judgement.

`glm-5.2` remains reserved for later comparison on page, frontend, content, and report-quality tasks. It was not needed
to prove the current scout loop.

## Follow-Up Questions For Fable

1. Is `deepseek-v4-flash` acceptable as the default Opportunity Scout model for now, given the 3/3 success rate and lower latency?
2. Is the Pro result meaningfully better enough to justify the slower runtime, or should Pro stay fallback-only?
3. Is `create_brief` appropriate for `entruempelung dachau` while cannibalization risk is `medium`, or should the prompt prefer
   `hold` until uniqueness evidence is stronger?
4. Does the fixture need a richer German-quality rubric before comparing `glm-5.2`, or is the current Martines seed enough?
5. Should the smoke runner preserve detailed validated output per run, instead of using reset-and-log summaries, before the next
   model comparison?

## Hygiene

- No API key, raw prompt, packet contents, provider body, or real customer data is included.
- The committed output remains limited to the synthetic fixture.
- The smoke logs under `.local-smoke-logs/` are local-only and are not product artifacts.
