---
paths:
  - "apps/web/src/**/*.{ts,tsx}"
  - "packages/ui/src/**/*.{ts,tsx}"
  - "src/components/**/*.tsx"
---

# React

Render logic is core logic: pure, deterministic, non-throwing. Effects belong
in event handlers, mutations, or Effects — never in render.

- Render explicit pending, error, blocked, empty, and success states where a
  workflow depends on remote data. Empty means no data; error means data or
  rendering failed — never collapse the two.
- Never call throwing parsers (`new URL(...)`, `JSON.parse`) directly in JSX
  on untrusted or remote data; guard with `URL.canParse` or a safe helper.
- Hooks: never in conditions, loops, nested functions, or after an early
  return. Dependency arrays are honest — if a dependency causes unwanted
  reruns, redesign the effect, never omit the dependency.
- Model mutually exclusive UI workflow states as a discriminated union or
  reducer, not as multiple booleans/nullables.
- User-triggered submits, approvals, deploys, and destructive actions run
  through handlers or mutations — never through `useEffect` state toggles.
- Prefer state colocation before memoization; add `useMemo`/`useCallback`/
  `memo` only for measured re-render pressure or stable props of memoized
  children — never around trivial primitive calculations.
- Never declare child components inside a parent component (identity reset),
  and never mutate non-local values during render.
- Route- or panel-level error boundaries around independently failing
  surfaces; lazy-load heavy optional surfaces (maps, editors, chart-heavy
  views) with explicit loading and error states.
- Hooks that touch browser-only APIs (localStorage, window, document) guard
  availability and keep render paths non-throwing.
