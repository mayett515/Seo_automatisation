---
description: "React render and hooks guardrails for pure rendering, error states, and non-throwing UI helpers"
globs: "apps/web/src/**/*.{ts,tsx}, packages/ui/src/**/*.{ts,tsx}, **/*.md"
alwaysApply: false
version: "1.0.0"
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
</positive-directives>

<absolute-constraints>
- DO NOT call throwing parsers such as `new URL(...)` directly in JSX for untrusted or remotely loaded data.
- DO NOT collapse failed API requests into ordinary empty or connection-required states.
- DO NOT mutate non-local values during render.
- DO NOT call hooks in conditions, loops, nested functions, handlers, or after an early return.
- DO NOT create generic data-fetching custom hooks that duplicate TanStack Query behavior for server state.
- DO NOT hide hook dependency problems by omitting dependencies.
- DO NOT declare child components inside parent components unless the identity reset is intentional and documented.
</absolute-constraints>

<conditional-logic>
IF a custom hook reads remote/server data:
THEN prefer a typed wrapper around TanStack Query with schema validation over a manual `useEffect + fetch + useState` implementation.

IF a hook touches browser-only APIs such as localStorage, URL, window, or document:
THEN guard runtime availability and keep render paths non-throwing.

IF a component has many local state values that represent one workflow state:
THEN consider a discriminated union state model or reducer before adding unrelated `useState` calls.
</conditional-logic>
