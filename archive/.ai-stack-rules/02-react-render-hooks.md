---
description: "React render and hooks guardrails for pure rendering, error states, and non-throwing UI helpers"
globs: "apps/web/src/**/*.{ts,tsx}, packages/ui/src/**/*.{ts,tsx}, **/*.md"
alwaysApply: false
version: "1.1.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "https://react.dev/reference/rules/components-and-hooks-must-be-pure"
  - "https://react.dev/reference/eslint-plugin-react-hooks"
  - "https://react.dev/reference/rules/rules-of-hooks"
  - "https://react.dev/learn/reusing-logic-with-custom-hooks"
  - "C:\\total typescript\\React_Patterns_Karteikarten\\Index.md"
  - "C:\\total typescript\\total_typescript_learning_path\\modules\\07_react_with_typescript\\index.md"
  - "C:\\total typescript\\total_typescript_learning_path\\modules\\08_advanced_react_with_typescript\\index.md"
priority_schema: "critical > strong > guideline"
rule_budget: "guard-exception"
---

# React Render And Hooks

<positive-directives>
- Keep render logic pure, deterministic, and non-throwing.
- Put side effects in event handlers, mutations, or effects, not directly in render.
- Render explicit pending, error, blocked, empty, and success states where user workflows depend on remote data.
- Use error boundaries or local error states for UI surfaces that parse or display external data.
- Keep custom hooks focused on one reusable concern and name them with `use`.
- Prefer TanStack Query for reusable server-data hooks instead of hand-rolled `useFetch` state machines.
- Use dependency arrays honestly; if a dependency causes unwanted repeats, redesign the effect to be idempotent or move logic to an event/mutation boundary.
- Use route/panel error boundaries, Suspense/lazy boundaries, and local skeletons for feature surfaces that can fail or load independently.
- Lift stable constants/components out of render when they do not depend on render state.
- React event handlers may ignore returned promises, but async work started from handlers must still have Query, Form, route, error-boundary, local-error, or explicit catch ownership.
- Use Effects to synchronize with external systems; put event-specific work in event handlers or TanStack mutations.
- Model mutually exclusive local UI workflow states as discriminated unions or reducers instead of multiple booleans/nullables.
- Prefer state colocation before memoization; add `useMemo`, `useCallback`, or `memo` only for expensive derived data, measured re-render pressure, or stable props required by memoized children.
- Use route-level or panel-level error boundaries around independently failing mission-control surfaces such as Opportunity Explorer, Page Preview/Page Studio, evidence panels, GSC panels, maps, agent timelines, and release verification panels.
- Lazy-load heavy optional surfaces such as maps, Page Studio, preview tooling, chart-heavy reports, and trace viewers, but keep workflow-critical loading and error states explicit.
</positive-directives>

<absolute-constraints>
- DO NOT call throwing parsers such as `new URL(...)` directly in JSX for untrusted or remotely loaded data.
- DO NOT collapse failed API requests into ordinary empty or connection-required states.
- DO NOT mutate non-local values during render.
- DO NOT call hooks in conditions, loops, nested functions, handlers, or after an early return.
- DO NOT create generic data-fetching custom hooks that duplicate TanStack Query behavior for server state.
- DO NOT hide hook dependency problems by omitting dependencies.
- DO NOT declare child components inside parent components unless the identity reset is intentional and documented.
- DO NOT route user-triggered submits, approvals, deploys, rejects, or destructive actions through `useEffect` state toggles.
- DO NOT collapse render/parse failures into empty states; empty means no data, error means data or rendering failed.
- DO NOT add memoization hooks around trivial primitive string, boolean, or number calculations.
</absolute-constraints>

<conditional-logic>
IF a custom hook reads remote/server data:
THEN prefer a typed wrapper around TanStack Query with schema validation over a manual `useEffect + fetch + useState` implementation.

IF a hook touches browser-only APIs such as localStorage, URL, window, or document:
THEN guard runtime availability and keep render paths non-throwing.

IF a component has many local state values that represent one workflow state:
THEN consider a discriminated union state model or reducer before adding unrelated `useState` calls.

IF an Effect dependency list feels wrong:
THEN change the code shape instead of silencing the dependency rule.
</conditional-logic>
