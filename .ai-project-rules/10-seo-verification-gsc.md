---
description: "GSC OAuth/API sync, indexing, keyword monitoring, post-deploy verification, and SEO QA rules"
globs: "**/*gsc*.{md,json,mmd,ts,tsx}, **/*search-console*.{md,json,mmd,ts,tsx}, **/*performance*.{md,json,mmd,ts,tsx}, **/*verification*.{md,json,mmd,ts,tsx}, **/*keyword*.{md,json,mmd,ts,tsx}, **/*report*.{md,json,mmd,ts,tsx}, **/*qa*.{md,json,mmd,ts,tsx}"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/architecture/08-deployment-netlify-gsc.md"
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/backend/02-worker-job-contracts.md"
  - "C:\\gebäudeservicefirma\\Seo\\checkobworking\\thursday-check.md"
priority_schema: "critical > strong > guideline"
---

# Domain Execution Contract: SEO Verification GSC

<meta-instruction>
You have been routed here because the task touches GSC OAuth/API sync, indexing, keyword monitoring, SEO QA, post-deploy verification, or ranking analysis.
</meta-instruction>

## 1. Focused Best Practices

<positive-directives>
- Treat GSC as an internal radar for indexing, impressions, queries, sitemap status, and early movement.
- Use Google OAuth plus the Search Console API as the primary product path for Search Analytics, sitemaps, URL/indexing status, and ongoing monitoring.
- Verify HTTP status, robots, canonical, schema, sitemap inclusion, tracking load, and core route health after deploy.
- Compare new keyword data against the stored baseline before changing opportunity or report status.
- Use weak GSC signals for internal roadmap tiers, not as customer-facing wins.
- Use before/after tracking windows to evaluate visitor retention and contact actions.
</positive-directives>

## 2. Hard Domain Prohibitions

<absolute-constraints>
- DO NOT use impressions as customer-facing success proof.
- DO NOT use CTR as customer-facing success proof.
- DO NOT use average position as customer-facing success proof.
- DO NOT mark a deployment healthy without post-deploy verification.
- DO NOT hide uncertainty in ranking or indexing interpretation.
- DO NOT use manual Search Console CSV export/import as a product fallback, bootstrap path, or replacement for OAuth/API sync.
</absolute-constraints>

## 3. Context-Dependent Trigger Gates

<conditional-logic>
IF a URL is not indexed or crawled but not indexed:
THEN verify sitemap status, request indexing when appropriate, and record the observation.

IF a page has impressions but no clicks:
THEN analyze snippet, title, CTA fit, market difficulty, and page relevance.

IF a query has weak rank or low proof:
THEN keep it in internal roadmap or monitoring until Top 10/Page 1 proof exists.

IF GSC OAuth/API access is unavailable:
THEN keep GSC-dependent automation waiting for connection or mark it blocked instead of substituting manual exports.

IF a generic page receives impressions for a more specific service-location query:
THEN treat that as a candidate for an opportunity brief, not automatic page creation.
</conditional-logic>

## 4. GSC API Ingestion Workflow

<positive-directives>
- Use scheduled GSC OAuth/API sync as the normal product workflow.
- Preserve the date range, property URL, and API sync run with every dataset.
- Compare synced data against prior baselines before changing opportunity tier, page status, or report eligibility.
- Flag queries where Google shows the wrong page, especially generic service pages appearing for service-location searches.
- Use GSC rows to discover opportunities such as impressions without clicks, positions 11-100, and service/location combinations.
</positive-directives>

<absolute-constraints>
- DO NOT treat raw GSC diagnostic rows as customer-facing report content.
- DO NOT build CSV import as a fallback feature for the core product workflow.
- DO NOT score opportunities without preserving the date range, source property, and API sync run.
- DO NOT create pages automatically from one weak query; require service fit, business value, SERP check, uniqueness, and quality-gate readiness.
</absolute-constraints>

## 5. Domain Anchoring & Examples

<context>
GSC is useful for diagnostics. Customer-facing proof should translate data into clear ranking tiers and decisions.

<example>
```text
// Good: internal diagnostic language
GSC shows first impressions for Bergkirchen. Keep monitoring and review the title if impressions grow without clicks.
```
</example>

<example>
```text
// Bad: weak signal becomes a win claim
We conquered Bergkirchen because GSC shows impressions.
```
</example>

<example>
```text
// Good: GSC data as opportunity input
The scheduled GSC sync shows `/entruempelung/` receiving impressions for `entruempelung dachau`. Create an opportunity brief and run the local page quality gate before proposing `/entruempelung-dachau/`.
```
</example>
</context>

## 6. Domain Post-Flight Verification

<pre-flight-checklist>
1. [ ] Did I keep GSC diagnostics separate from customer-facing success proof?
2. [ ] Did post-deploy verification include technical health checks?
3. [ ] Did weak signals stay in monitoring or roadmap status?
4. [ ] Did GSC API data preserve property, date range, page, query, metric context, and sync-run context?
</pre-flight-checklist>
