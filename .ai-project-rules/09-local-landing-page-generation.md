---
description: "Route, subdomain, page JSON, and publish-readiness rules for generated local landing pages"
globs: "**/*landing*.{md,json,mmd,ts,tsx}, **/*subdomain*.{md,json,mmd,ts,tsx}, **/*local-page*.{md,json,mmd,ts,tsx}, **/*route*.{md,json,mmd,ts,tsx}, **/*page*.json"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/product/05-template-component-preview-system.md"
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/product/07-subdomains-local-pages.md"
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/frontend/03-preview-and-notes-ux.md"
priority_schema: "critical > strong > guideline"
---

# Domain Execution Contract: Local Landing Page Generation

<meta-instruction>
You have been routed here because the task touches generated local pages, subdomain decisions, route design, page JSON, template/component selection, preview generation, or publish readiness.
</meta-instruction>

## 1. Focused Best Practices

<positive-directives>
- Prefer normal local pages unless a subdomain has enough market, content, and strategy to justify itself.
- Generate pages from an opportunity matrix with explicit service, location, route, keywords, components, and proof.
- Keep generated pages in preview until customer approval and deployment checks pass.
- Use noindex or backlog state when content, proof, or strategy is not ready.
- Add routes to sitemap only when the page is publish-ready.
</positive-directives>

## 2. Hard Domain Prohibitions

<absolute-constraints>
- DO NOT create a subdomain just because one keyword exists.
- DO NOT add a page to sitemap before publish readiness.
- DO NOT make generated previews indexable.
- DO NOT ignore route conflicts with existing live pages.
- DO NOT publish pages with no local proof or uniqueness rationale.
</absolute-constraints>

## 3. Context-Dependent Trigger Gates

<conditional-logic>
IF the location is smaller or the content depth is limited:
THEN use an `/orte/` or service-location page instead of a subdomain.

IF the location is large and has enough content strategy:
THEN a subdomain can be proposed but still requires preview, approval, deployment, and verification.

IF a page is generated from customer notes:
THEN store the note-derived instructions with the page version.
</conditional-logic>

## 4. Domain Anchoring & Examples

<context>
Decision model: opportunity -> market size -> content/strategy depth -> page or subdomain -> template -> local proof -> preview -> approval -> deploy.

<example>
```json
// Good: page proposal includes intent and readiness fields
{ "route": "/leistungen/flachdachsanierung-dachau/", "primaryKeyword": "flachdachsanierung dachau", "status": "preview", "sitemapReady": false }
```
</example>

<example>
```json
// Bad: live route without proof or readiness
{ "route": "dachau.customer.de", "status": "live", "primaryKeyword": "dachau", "sitemapReady": true }
```
</example>
</context>

## 5. Domain Post-Flight Verification

<pre-flight-checklist>
1. [ ] Did route strategy match market size and content depth?
2. [ ] Did generated output remain preview/noindex until approval?
3. [ ] Did sitemap inclusion wait for publish readiness?
</pre-flight-checklist>
