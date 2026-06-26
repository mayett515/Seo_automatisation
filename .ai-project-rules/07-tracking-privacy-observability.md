---
description: "Tracking, privacy, security, and observability rules for Local SEO projects"
globs: "**/*tracking*.{md,json,mmd,ts,tsx}, **/*analytics*.{md,json,mmd,ts,tsx}, **/*privacy*.{md,json,mmd,ts,tsx}, **/*security*.{md,json,mmd,ts,tsx}, **/*gsc*.{md,json,mmd,ts,tsx}, src/**/*.{ts,tsx}, apps/**/*.{ts,tsx}"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/architecture/09-observability-security-privacy.md"
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/product/11-tracking-experiments-retention.md"
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/backend/03-tracking-event-design.md"
priority_schema: "critical > strong > guideline"
---

# Domain Execution Contract: Tracking Privacy Observability

<meta-instruction>
You have been routed here because the task touches analytics, tracking events, GSC OAuth, privacy, security, tenant isolation, audit logs, or operational observability.
</meta-instruction>

## 1. Focused Best Practices

<positive-directives>
- Track anonymous events such as page views, scroll depth, CTA visibility, CTA clicks, phone clicks, WhatsApp clicks, form starts, and form submits.
- Encrypt Google OAuth tokens at rest and scope access by project.
- Preserve tenant isolation and project-level authorization.
- Log approvals, deploys, rollbacks, worker failures, sitemap updates, GSC sync status, and report generation status.
- Require explicit opt-in before advanced tracking such as session replay or heatmaps.
- Require an ingestion boundary for public tracking endpoints before persisted project events are accepted.
- Prefer per-project public ingestion keys over global shared tracking secrets.
- Return explicit dry-run/not-persisted status when tracking is validated but not stored.
</positive-directives>

## 2. Hard Domain Prohibitions

<absolute-constraints>
- DO NOT store form contents.
- DO NOT store names, emails, or phone numbers from tracking payloads.
- DO NOT enable session replay by default.
- DO NOT mix tracking data across projects.
- DO NOT report silent tracking failures as success.
- DO NOT accept persisted project tracking events from the public endpoint without an ingestion token or equivalent project-scoped public key.
- DO NOT use one global browser-exposed tracking secret as the final production isolation boundary.
- DO NOT compare tracking or webhook-style secrets with ordinary string equality when timing-safe comparison is practical.
- DO NOT return `accepted: true` for production tracking unless the event was persisted or queued.
</absolute-constraints>

## 3. Context-Dependent Trigger Gates

<conditional-logic>
IF a tracking event includes arbitrary payload data:
THEN replace it with an explicit allowlist schema.

IF GSC or OAuth tokens are persisted:
THEN encrypt them and enforce project-level access.

IF tracking is missing during deployment:
THEN report a warning unless tracking is contractually required.

IF a tracking endpoint is public by design:
THEN keep the payload allowlisted and require a project-scoped ingestion boundary before persisting real customer events.

IF a tracking event is accepted for a persisted project:
THEN persist it, enqueue it, or return an explicit dry-run/not-persisted response.

IF a tracking key is sent from browser-side code:
THEN treat it as publishable and scope it to a single project/domain with rotation support.
</conditional-logic>

## 4. Domain Anchoring & Examples

<context>
Allowed event intent: observe page behavior and contact actions without collecting sensitive visitor content.

<example>
```ts
// Good: minimal event payload
track("phone_click", { projectId, pageId, route, componentId });
```
</example>

<example>
```ts
// Bad: sensitive visitor data enters analytics
track("form_submit", { name, email, phone, message });
```
</example>
</context>

## 5. Domain Post-Flight Verification

<pre-flight-checklist>
1. [ ] Did tracking payloads exclude sensitive user-provided content?
2. [ ] Did token handling preserve encryption and project isolation?
3. [ ] Did operational status reflect real failures and retries?
4. [ ] Did public tracking ingestion reject persisted project events without a trusted ingestion boundary?
5. [ ] Did accepted tracking events either persist/queue successfully or disclose dry-run/not-persisted state?
</pre-flight-checklist>
