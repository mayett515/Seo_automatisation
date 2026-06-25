---
description: "TanStack Query and Router guardrails for query states, keys, invalidation, params, and route-safe API calls"
globs: "apps/web/src/**/*.{ts,tsx}, packages/ui/src/**/*.{ts,tsx}, **/*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "https://tanstack.com/query/v5/docs/framework/react/guides/queries"
  - "https://tanstack.com/query/v5/docs/framework/react/guides/query-keys"
  - "https://tanstack.com/query/v5/docs/framework/react/guides/invalidations-from-mutations"
  - "https://tanstack.com/router/latest/docs/guide/path-params"
priority_schema: "critical > strong > guideline"
---

# TanStack Query And Router

<positive-directives>
- Model Query states explicitly: pending, error, success, and background fetching when relevant.
- Use serializable, stable query keys that include every variable that changes the fetched data.
- Invalidate affected queries after successful mutations.
- Prefer route-owned typed params. Use `useParams({ strict: false })` only in shared components that are intentionally route-ambiguous.
- Encode route params when manually constructing API URLs.
</positive-directives>

<absolute-constraints>
- DO NOT treat `data === undefined` as the same thing as a business-level blocked state.
- DO NOT build query keys that omit project/customer/date-range/provider variables.
- DO NOT let demo route-param fallbacks hide production route bugs.
</absolute-constraints>
