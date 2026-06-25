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
priority_schema: "critical > strong > guideline"
---

# React Render And Hooks

<positive-directives>
- Keep render logic pure, deterministic, and non-throwing.
- Put side effects in event handlers, mutations, or effects, not directly in render.
- Render explicit pending, error, blocked, empty, and success states where user workflows depend on remote data.
- Use error boundaries or local error states for UI surfaces that parse or display external data.
</positive-directives>

<absolute-constraints>
- DO NOT call throwing parsers such as `new URL(...)` directly in JSX for untrusted or remotely loaded data.
- DO NOT collapse failed API requests into ordinary empty or connection-required states.
- DO NOT mutate non-local values during render.
</absolute-constraints>
