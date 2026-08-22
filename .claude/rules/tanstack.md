---
paths:
  - "apps/web/src/**/*.{ts,tsx}"
  - "packages/ui/src/**/*.{ts,tsx}"
---

# TanStack

TanStack Query owns server state; TanStack Router owns route params and
route-level contracts. Neither is generic client state.

## Query

- Never hand-roll `useEffect + fetch + useState` for server data — a typed
  wrapper around Query with schema validation is the floor.
- Query keys are serializable, stable, and include EVERY variable that
  changes the fetched data (project, customer, date range, provider).
- Model query states explicitly; `data === undefined` is not a business-level
  blocked state.
- Invalidate affected queries after successful mutations. Best-effort cache
  invalidation may be detached with `void` only when stale UI is the sole
  failure mode.
- Product-state mutations expose pending/success/error in the UI — never rely
  solely on eventual invalidation. Every user-triggered mutation is owned by
  Query/Form state, a route boundary, visible error UI, or an explicit
  `.catch`.
- Local component state may stage explicit user input before a
  contract-parsed mutation; it is never hidden durable decision state.

## Router

- Route-owned typed params; `useParams({ strict: false })` only in components
  that are intentionally route-ambiguous. Encode params when constructing API
  URLs by hand. Demo fallbacks must not hide production route bugs.

## Ecosystem restraint

Form, Table, Store, and Virtual are separate adoption decisions: Form for
multi-field validation-heavy persisted forms; Table for dense repeated
operational data; Virtual only when measured row count justifies it; broad
React Context never carries changing server/workflow state that Query or
Store owns better. Scaffold-mutating TanStack CLI commands (`create`, `add`)
require explicit user approval.
