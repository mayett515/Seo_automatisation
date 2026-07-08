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
  - ".ai-stack-rules/09-tanstack-ecosystem-schema.md"
priority_schema: "critical > strong > guideline"
---

# TanStack Query And Router

<positive-directives>
- Model Query states explicitly: pending, error, success, and background fetching when relevant.
- Use serializable, stable query keys that include every variable that changes the fetched data.
- Invalidate affected queries after successful mutations.
- Best-effort cache invalidations may be detached with `void` when stale UI is the only failure mode.
- User-triggered mutations, submissions, approvals, deploys, destructive actions, or provider-affecting requests must be owned by TanStack Query/Form state, a route/action boundary, visible error UI, or an explicit `.catch`.
- Prefer route-owned typed params. Use `useParams({ strict: false })` only in shared components that are intentionally route-ambiguous.
- Encode route params when manually constructing API URLs.
- Use TanStack Form for non-trivial persisted decision forms: multi-field, validation-heavy, reusable, or workflow-rich approval, hold, reject, notes, ranking proof, rollback, Page Studio section edits, and onboarding forms.
- Small one-field persisted decision controls may use local component state when the request is parsed through the shared contract/Zod schema, the mutation exposes pending/success/error states, failure has visible UI or an explicit owner, and the local state is not treated as product truth.
- Use TanStack Table for dense repeated operational data such as opportunities, keywords, proofs, release checks, reports, agent runs, and page versions.
- Use TanStack Virtual only when rendered row count or measured UI cost justifies it.
- Product-state mutations must expose pending, success, and error states in the UI instead of relying only on eventual query invalidation.
- For TanStack CLI scaffolding, add-ons, or ecosystem choices, use installed TanStack CLI skills and official CLI metadata discovery before choosing flags.
- Use `.ai-stack-rules/09-tanstack-ecosystem-schema.md` when the TanStack question is broader than Query/Router component code.
</positive-directives>

<absolute-constraints>
- DO NOT treat `data === undefined` as the same thing as a business-level blocked state.
- DO NOT build query keys that omit project/customer/date-range/provider variables.
- DO NOT let demo route-param fallbacks hide production route bugs.
- DO NOT put changing server/workflow state into broad React Context when TanStack Query or Store owns the state better.
- DO NOT use local component state as hidden durable decision state; it may only stage explicit user input before a contract-parsed mutation.
- DO NOT virtualize small lists just because the library exists.
- DO NOT run `tanstack create`, `tanstack add`, or other scaffold-mutating CLI commands without explicit user approval.
- DO NOT run TanStack CLI metadata commands that may use network/telemetry unless the task explicitly calls for current TanStack metadata or the user approves it.
</absolute-constraints>
