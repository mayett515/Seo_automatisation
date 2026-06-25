---
description: "Frontend UX and TanStack rules for the Local SEO mission-control application"
globs: "src/**/*.{tsx,ts}, apps/**/*.{tsx,ts}, packages/**/*.{tsx,ts}, **/*frontend*.md, **/*ux*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/frontend/01-frontend-architecture.md"
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/frontend/02-customer-visible-screens.md"
  - "local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/frontend/03-preview-and-notes-ux.md"
priority_schema: "critical > strong > guideline"
---

# Domain Execution Contract: Frontend TanStack

<meta-instruction>
You have been routed here because the task touches React UI, routing, forms, tables, state management, preview UX, customer screens, maps, dashboards, or frontend diagrams.
</meta-instruction>

## 1. Focused Best Practices

<positive-directives>
- Use React with TypeScript and TanStack Router for application routes.
- Use TanStack Query for server state, worker status, release status, and polling.
- Use TanStack Form for audit, onboarding, notes, approval, hold, and rollback forms.
- Use TanStack Table for keywords, bundles, pages, reports, checks, and release items.
- Use TanStack Store only for local/shared UI state that is not server state.
</positive-directives>

## 2. Hard Domain Prohibitions

<absolute-constraints>
- DO NOT place server state in a client-only store.
- DO NOT build a marketing landing page when the task asks for the app experience.
- DO NOT expose deploy actions without release status, approval status, and risk context.
- DO NOT clone the copied HTML inspiration as the product UI.
</absolute-constraints>

## 3. Context-Dependent Trigger Gates

<conditional-logic>
IF the task creates or changes a route:
THEN model it in TanStack Router and keep route params explicit.

IF the task handles fetched data, job status, or release status:
THEN use TanStack Query patterns instead of ad hoc effects.

IF the task creates a customer decision flow:
THEN include preview, note, approve, hold, reject, or rollback actions as appropriate.
</conditional-logic>

## 4. Domain Anchoring & Examples

<context>
Target UX Layout: top project status, left navigation/map/sections, center work area, right analyst or decision panel, bottom worker timeline/activity feed.

<example>
```tsx
// Good: server state belongs in TanStack Query
const releaseQuery = useQuery(releaseStatusQueryOptions(projectId, releasePlanId));
```
</example>

<example>
```tsx
// Bad: server state is hidden in local app state
const [releaseStatus, setReleaseStatus] = useState<ReleaseStatus>("loading");
```
</example>
</context>

## 5. Domain Post-Flight Verification

<pre-flight-checklist>
1. [ ] Did I use the correct TanStack primitive for route, server state, form, table, or UI state?
2. [ ] Did customer-visible screens preserve preview and decision control?
3. [ ] Did I avoid copying inspiration HTML as implementation truth?
</pre-flight-checklist>
