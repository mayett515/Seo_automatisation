# Shared UI

- Components remain presentational unless the package explicitly owns a reusable interaction state machine.
- Keep server state in TanStack Query at the application boundary; do not create a second cache in shared UI.
- Make accessibility, loading, error, empty, disabled, and focus behavior part of the public component contract.
- Avoid business-domain dependencies in general-purpose primitives.
- Do not declare child components inside render functions or mutate non-local state during render.
