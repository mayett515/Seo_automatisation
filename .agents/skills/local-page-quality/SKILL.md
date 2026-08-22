---
name: local-page-quality
description: Review a local SEO service-location page before preview approval, deployment, sitemap inclusion, or customer reporting. Use for page uniqueness, local proof, hub/spoke intent, technical SEO, crawlability, schema, and publication readiness; not for general copyediting.
---

# Local page quality gate

A local page may reuse a layout but must not reuse the same thinking. Review the page and its nearest hub/spoke competitors using repository evidence; do not invent local proof.

## Admission checks

1. Confirm the brief defines route, service, location, primary and secondary keywords, intent, audience, conversion goal, proof sources, and why a separate page should exist.
2. Compare the relevant hub and nearby spokes. Record the uniqueness delta in purpose, sections, FAQ, internal links, schema, evidence, and wording—not only the city name.
3. Verify unique title, meta description, canonical, H1, useful localized H2s, CTAs, alt text, and service/location-specific buyer questions.
4. Verify local details are sourced: districts, nearby towns, service radius, logistics, regulation, disposal, ZIPs, or municipality information only where supported.
5. Verify hub-to-spoke, spoke-to-hub, nearby-spoke, and conversion-path links. The page must not be orphaned or depend solely on client-side discovery.
6. Validate applicable `LocalBusiness`, `Service`, `areaServed`, and `FAQPage` structured data. Check canonical/trailing-slash behavior, preview noindex, robots, route conflicts, and sitemap admission only after approval.
7. Confirm build/preview evidence and define post-deploy HTTP, canonical, robots, schema, sitemap, tracking, route-health, and GSC follow-up checks.

## Decision

Return one of:

- `PASS`: evidence and technical gates support preview/deploy handoff.
- `PASS_WITH_WARNINGS`: no blocker, but explicit risks remain visible.
- `BLOCKED`: missing proof, duplicated intent/content, approval gap, indexability defect, or other admission failure.

Separate internal opportunity signals from customer-facing proof. Impressions, weak positions, or inferred opportunity are not ranking-success claims.
