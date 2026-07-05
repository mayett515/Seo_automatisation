# 0015 - No Paid SERP API Proof Strategy

Date: 2026-07-05
Status: Accepted

## Context

The SERP evidence roadmap briefly considered dedicated SERP providers such as DataForSEO, SerpApi, and Serper as the standard production path for deterministic rank capture.

That was an over-broad provider-research branch. The product constraint is now explicit: the MVP must not rely on paid SERP APIs, proxy-based rank scrapers, or LLM/web-search answers as customer-safe Google ranking proof.

Current implementation facts:

- `ranking_proofs` exists as a project-owned manual proof table.
- `ranking_proofs` can be invalidated/re-reviewed and stale proof rows are excluded from Opportunity Scout proof resolution.
- `serp_snapshots` exists as a project-owned snapshot table; captured rows may enter Opportunity Scout as supporting context, never as customer-safe proof.
- `technical_audit_findings` exists as a project-owned own-site audit evidence source; findings may support opportunity decisions but cannot prove rankings.
- GSC is internal radar and cannot be customer-facing rank proof.
- AI reasoning output remains untrusted until Zod parsing, deterministic QA, evidence resolution, and human decisions.

## Decision

For the MVP, customer-safe Google ranking proof comes from manually recorded and reviewed `ranking_proofs`.

Paid SERP APIs are rejected as an MVP dependency. DataForSEO, SerpApi, Serper, SearchAPI, and proxy-based rank-scraping providers may be kept as technical alternatives in research notes, but they are not the planned F.2 implementation path.

`serp_snapshots`, browser captures, model/web-search observations, GSC rows, technical audit findings, and competitor/search context default to `supporting_context` or `internal_signal`. They cannot satisfy `proven_win` or customer-facing ranking claims unless a future ADR explicitly promotes a deterministic proof source and defines its proof policy.

The F.2 roadmap branch is:

```text
TechnicalAudit + ManualProof + optional OperatorCapture
```

not SERP API integration.

## Consequences

This keeps customer-facing proof conservative and avoids vendor cost, proxy risk, and SERP-provider lock-in.

It also means automatic rank proof is not the MVP promise. The product can still automate useful work through:

- GSC opportunity discovery as internal radar,
- website import and technical audits,
- manual ranking-proof review,
- optional operator capture for evidence support,
- AI interpretation of project-owned evidence.

`SerpScoutPort` remains useful as a deterministic capture boundary. Its baseline can support internal/search-context snapshots and future proof experiments without changing contracts again.

## Alternatives Considered

### Dedicated SERP API Provider

Rejected for MVP. DataForSEO, SerpApi, Serper, and similar providers are technically plausible, but they add paid dependencies and shift the product toward outsourced rank tracking.

### LLM Or Web-Search Rank Proof

Rejected. A model or search tool may suggest queries, summarize context, or recommend manual checks, but it must not create customer-safe ranking truth.

### Browser Capture As Automatic Proof

Deferred. Browser or operator capture can create artifacts, screenshots, or search-context rows. It becomes customer-safe only after human review materializes a `ranking_proof`, unless a future ADR defines a stricter deterministic promotion path.

## Regression Guard

Future work must not:

- reintroduce paid SERP APIs as the default MVP path without superseding this ADR,
- let `serp_snapshot` evidence satisfy `proven_win` by row existence alone,
- treat GSC average position, impressions, or CTR as customer-safe rank proof,
- treat model/web-search output as Google ranking proof,
- turn browser screenshots into automatic proof without a reviewed `ranking_proof` or a new ADR.

## Related Files

- `docs/architecture/agent-first-mvp-roadmap.md`
- `docs/architecture/ai-reasoning-port-and-opportunity-scout-contracts.md`
- `docs/progress/2026-07-05.md`
- `C:/big eater/no-serp-api-seo-evidence-strategy-stealer-findings-2026-07-05.md`
- `C:/big eater/serp-provider-strategy-stealer-findings-2026-07-05.md`
