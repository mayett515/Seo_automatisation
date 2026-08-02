---
description: "Anti-regression bans for customer-facing SEO reporting and ranking proof language"
globs: "**/*report*.{md,json,mmd,ts,tsx,html}, **/*kundenreport*.{md,json,mmd,ts,tsx,html}, **/*ranking*.{md,json,mmd,ts,tsx}, **/*forecast*.{md,json,mmd,ts,tsx}"
alwaysApply: false
version: "1.1.3"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/product/09-reports-seo-game.md"
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/decisions/ADR-005-conservative-forecasting.md"
  - "C:\\gebäudeservicefirma\\Seo\\future-seo-growth-plan\\04-anti-regression.md"
  - "docs/architecture/decisions/0021-digest-bound-customer-report-publication.md"
priority_schema: "critical > strong > guideline"
rule_budget: "guard-exception"
---

# Anti-Regression Contract: SEO Reporting

<meta-instruction>
You have been routed here because the task risks weakening customer-facing SEO proof, mixing future opportunities into proven wins, or reintroducing GSC diagnostic metrics into customer reports.
</meta-instruction>

## 1. Historical Context

<incident-reports>
- Incident R-001: A report used GSC averages and made strong local page-1 wins look mediocre.
- Incident R-002: Impression, CTR, and average-position metrics diluted a clearer Top 10/Page 1 story.
- Incident R-003: Pfaffenhofen Stadt was tempting to present as conquered without page-1 proof.
- Incident R-004: Entruempelung had useful internal signals but not enough proof for a customer-facing win claim.
- Incident R-005: Future opportunity keywords were at risk of being mixed into proven KPI counts.
</incident-reports>

## 2. Hard Regression Bans

<absolute-constraints>
- REGRESSION BAN R-001: DO NOT add a raw GSC diagnostics page to a customer report.
- REGRESSION BAN R-002: DO NOT show impressions in customer-facing result tables.
- REGRESSION BAN R-002: DO NOT show CTR in customer-facing result tables.
- REGRESSION BAN R-002: DO NOT show average position in customer-facing result tables.
- REGRESSION BAN R-003: DO NOT sell Pfaffenhofen Stadt as conquered without page-1 proof.
- REGRESSION BAN R-004: DO NOT sell Entruempelung as conquered without page-1 proof.
- REGRESSION BAN R-005: DO NOT mix future opportunity keywords into the same KPI count as proven rankings.
- REGRESSION BAN R-006: DO NOT guarantee rankings, leads, revenue, or fixed timelines.
- REGRESSION BAN R-007: DO NOT rebuild a published report from current operational rows; use its immutable canonical snapshot and frozen evidence.
- REGRESSION BAN R-008: DO NOT let AI select report facts, evidence, proof tiers, actions, targets, statuses, or publication.
- REGRESSION BAN R-009: DO NOT publish or correct a report without a persisted human actor bound to the exact reviewed snapshot digest.
- REGRESSION BAN R-010: DO NOT let a report Next Action bypass Page Studio, approval, release, deploy, verification, or rollback gates.
</absolute-constraints>

## 3. Anti-Regression Conditional Gates

<conditional-logic>
IF upstream product docs mention CTR in a customer report layout:
THEN treat CTR as internal diagnostic context only; the anti-regression bans in this file win.

IF customer-facing text needs ranking proof:
THEN use Page 1, Top 10, Top 5, Top 3, Platz 2, or Platz 1 language.

IF clicks are shown to a customer:
THEN use them only as a clearly sourced supporting outcome metric, not as ranking proof and not inside raw GSC diagnostic tables.

IF a keyword is useful but weak:
THEN place it in internal planning, monitoring, or a future roadmap.

IF a future service expansion is mentioned:
THEN label it as planned, opportunity, next rollout, or monitoring.

IF a customer-facing report schema, serializer, component, export, or API response is introduced:
THEN add an executable test or schema guard proving impressions, CTR, and average-position fields cannot appear in that customer-facing payload.

IF GSC performance data is exposed through an API:
THEN separate internal-radar responses from customer-report responses before reuse.

IF a report payload guard uses banned field names:
THEN ban specific GSC diagnostic names such as impressions, CTR, and average-position; do not flat-ban generic words such as `position` across all nested customer payloads.

IF a customer-report aggregate is introduced:
THEN use the ADR 0021 digest-bound snapshot/provenance boundary and keep generation, publication, export, and downstream action conclusions separate.

IF deterministic report generation selects operational evidence:
THEN build one bounded server-owned packet, bind each source to canonical payload bytes, exclude GSC diagnostics and coarse release-plan status, and re-select the packet before draft persistence.

IF detailed release-verification checks become customer report warnings:
THEN admit only server-allowlisted check keys and scopes, render fixed customer-language copy, and exclude GSC, recovery, execution, and raw operator diagnostics.

IF a monthly customer report is generated:
THEN bind the cutoff to the completed Europe/Berlin calendar month plus the documented seven-day generation grace, select only the latest terminal verification per deployment, and keep event evidence inside the documented period/cutoff window.

IF report claims or navigation actions are selected from a packet:
THEN keep evidence limits below the claim cap and apply deterministic per-surface action quotas after stable key ordering.

IF a report exposes a release-review navigation action:
THEN bind its release-plan id to the supporting immutable release evidence inside the snapshot; do not reconstruct the target from mutable operational rows.

IF a report generation transport job disappears:
THEN recover only the deterministic fact-only lane under the same run id and end bounded exhaustion in visible durable failure.

IF `report_narrative` is enabled:
THEN keep factual sentences, values, citations, warnings, and action cards deterministic; AI may draft only bounded fact-light prose for server-assigned claims.

IF a customer-facing Next Action is consequential:
THEN freeze a typed server-owned intent, require an explicit human receipt, and dispatch through the existing target use case with its own permission and expected-state/revision gate.

IF HTML or PDF is delivered for a report:
THEN treat it as an immutable derivative of the canonical snapshot and do not let rendering add customer facts.
</conditional-logic>

## 4. Domain Anchoring & Examples

<context>
Reports should turn data into decisions: where we win, where momentum exists, where to attack, where to pause, and what the customer should approve.

<example>
```text
// Good: proof language is customer-safe
54 page-1 rankings are proven. Entruempelung stays in the opportunity roadmap until Top 10 proof exists.
```
</example>

<example>
```text
// Bad: diagnostic metrics dilute or overclaim
The report proves Entruempelung is won because impressions increased and average position improved.
```
</example>
</context>

## 5. Post-Flight Regression Verification

<pre-flight-checklist>
1. [ ] Did I avoid banned GSC metrics in customer-facing result tables?
2. [ ] Did I keep future opportunities separate from proven ranking wins?
3. [ ] Did every customer-facing claim use conservative proof language?
4. [ ] Did customer-facing report contracts actively exclude impressions, CTR, and average-position fields?
</pre-flight-checklist>
