---
description: "Reusable quality gate for local SEO service-location pages before preview approval, deployment, and reporting"
globs: "**/*local*.{md,json,mmd,ts,tsx}, **/*landing*.{md,json,mmd,ts,tsx}, **/*seo*.{md,json,mmd,ts,tsx}, **/*page*.{md,json,mmd,ts,tsx}, **/*deploy*.{md,json,mmd,ts,tsx}, **/*sitemap*.{md,json,mmd,ts,tsx}"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - ".ai-project-rules/04-deployment-agent.md"
  - ".ai-project-rules/08-seo-content-constraints.md"
  - ".ai-project-rules/09-local-landing-page-generation.md"
  - ".ai-project-rules/10-seo-verification-gsc.md"
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/product/06-local-seo-engine.md"
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/product/07-subdomains-local-pages.md"
  - "C:\\gebäudeservicefirma\\Seo\\workflow"
priority_schema: "critical > strong > guideline"
---

# Domain Execution Contract: Local SEO Page Quality Gate

<meta-instruction>
You have been routed here because the task touches local SEO page quality, service-location page generation, page uniqueness, deployment readiness, sitemap readiness, schema readiness, noscript/static reachability, or post-deploy SEO QA.
</meta-instruction>

## 1. Core Rule

<absolute-constraints>
- Local SEO pages may share the same layout, but they must not share the same thinking.
</absolute-constraints>

<positive-directives>
- Each subpage needs its own local purpose, wording, alt texts, schema, internal links, search intent, and proof strategy.
- Treat this file as the reusable quality gate before preview approval, deploy handoff, and customer-report handoff.
- Use `C:\gebäudeservicefirma\Seo\workflow` as read-only field evidence when real workflow examples are needed.
</positive-directives>

## 2. Required Page Brief

<positive-directives>
- Define route, service, target location, primary keyword, secondary keywords, search intent, target audience, and conversion goal.
- Explain why this page should exist separately from the main service page and nearby location pages.
- Record the uniqueness delta against the relevant hub page and any nearby spoke pages.
- Identify proof sources, field evidence, customer notes, or declare that proof is missing and the page must stay in preview/noindex.
- Define the internal-link plan before publish: hub-to-spoke, spoke-to-hub, nearby spokes, and contact path.
</positive-directives>

## 3. Content And UX Gate

<positive-directives>
- Require a unique SEO title, meta description, canonical URL, and one clear H1 with service and location.
- Add localized H2 sections based on real intent, not a generic city-name replacement.
- Put the strongest conversion paths above the fold, normally phone, form request, and WhatsApp when the customer supports it.
- Add location-specific context such as districts, neighborhoods, nearby towns, service radius, logistics, or local disposal/regulatory context when relevant.
- Add real local detail when it helps intent: districts, nearby towns, local routes, disposal/recycling context, service logistics, municipality names, or ZIP/service-area details.
- Add service-specific FAQ content that answers real buyer questions for that service and location.
- Localize image alt text and component copy for the correct service and location.
</positive-directives>

<absolute-constraints>
- DO NOT publish a page that is only a copied service page with the city name changed.
- DO NOT use generic filler to pretend a page has local proof.
- DO NOT keyword-stuff headings, alt text, FAQ, or schema.
- DO NOT use competitor copy as source text.
</absolute-constraints>

## 4. Technical SEO Gate

<positive-directives>
- Validate structured data before deploy; local pages commonly need `LocalBusiness`, `Service`, `areaServed`, and `FAQPage` where appropriate.
- For service-location pages, map `Service` and `areaServed` to the intended municipality, districts, service radius, or ZIP codes when known.
- Require the canonical URL to point to the intended trailing-slash live URL.
- Add sitemap inclusion only after preview approval and publish readiness.
- Add redirect or rewrite handling for the non-slash route when the target site uses trailing slashes.
- Keep staging and previews noindex.
- Ensure the page is reachable without JavaScript through visible SEO links, static fallback links, or noscript fallback where the target site needs it.
</positive-directives>

<absolute-constraints>
- DO NOT add unapproved preview pages to sitemap.
- DO NOT leave intended live pages blocked by noindex, broken canonical, robots, or route conflicts.
- DO NOT mark deployment healthy until HTTP status, canonical, robots, schema, sitemap, tracking, and core route health are checked.
</absolute-constraints>

## 5. Cannibalization And Hub Role Gate

<conditional-logic>
IF a new service-location page is created from an existing service page:
THEN update or review the existing service page so it keeps its hub role and does not compete too strongly with the local spoke.

IF multiple local pages target nearby places:
THEN compare intent, sections, FAQs, alt text, internal links, and schema before publish.

IF GSC shows impressions without clicks or weak average position:
THEN treat it as internal opportunity evidence, not customer-facing proof.
</conditional-logic>

<absolute-constraints>
- DO NOT report local market success to the customer from impressions alone.
- DO NOT let the hub page and spoke page target the same long-tail query with the same wording and structure.
</absolute-constraints>

## 6. Internal Linking And Crawlability Gate

<positive-directives>
- Pass authority to new pages through contextual links from relevant hubs, strong adjacent service pages, nearby local spokes, navigation sections, and contact paths.
- Keep URLs crawlable through internal links, sitemap entries after approval, trailing-slash canonical handling, redirects, and static or noscript fallback where the customer site needs it.
- Use crawlability and internal-link readiness as deployment checks, not post-launch cleanup.
</positive-directives>

<absolute-constraints>
- DO NOT publish an orphan local page.
- DO NOT rely only on JavaScript-rendered discovery for important local SEO pages.
- DO NOT add navigation links that create doorway-page spam or confuse hub/spoke roles.
</absolute-constraints>

## 7. Deployment Agent Checklist

<pre-flight-checklist>
1. [ ] Page brief includes route, service, location, keywords, intent, proof source, and uniqueness delta.
2. [ ] Title, meta description, H1, H2s, FAQ, image alt text, and CTAs are unique for this service-location page.
3. [ ] Local context is real enough to justify the page and not just a city-name swap.
4. [ ] Hub/spoke role separation and internal links are checked.
5. [ ] JSON-LD parses and includes the correct local service context.
6. [ ] Canonical, trailing-slash redirect, sitemap readiness, and noindex/indexability are checked.
7. [ ] Page is reachable without JavaScript where the customer site requires static or noscript fallback links.
8. [ ] Build, preview, route status, and post-deploy verification evidence are recorded.
9. [ ] GSC submission and monitoring steps are planned after deployment.
10. [ ] Customer-facing claims are limited to proven rankings, not internal opportunity signals.
</pre-flight-checklist>

## 8. Domain Anchoring

<context>
Use the Dachau clear-out workflow as a reference pattern when relevant:

```text
C:\gebäudeservicefirma\Seo\workflow\entruempelung-dachau-workflow-2026-06-25.md
```

That workflow demonstrates the expected loop: GSC signal -> dedicated local page -> hub role separation -> unique local sections -> LocalBusiness/Service/FAQPage schema -> internal links -> sitemap/redirect/noscript updates -> build/deploy/live checks -> GSC indexing sequence -> delayed customer-facing reporting until real proof exists.
</context>
