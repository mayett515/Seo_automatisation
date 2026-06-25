# 2026-06-25 Nest/React Review

Trigger: external static review of the GSC vertical slice and frontend screens.

## Promoted Rules

- Queue availability must be checked before returning a queued job contract.
- External request bodies should be parsed with schemas, not cast from `unknown`.
- Frontend API responses should be parsed with shared schemas when contracts already exist.
- Environment URLs should be URL-shaped and protocol-constrained before any `new URL(...)` call.
- OAuth callback logging should normalize provider failures and avoid raw provider bodies/secrets.
- React custom hooks should be focused and should not duplicate TanStack Query for server state.
- Hook dependencies should be honest; solve repeat behavior with idempotent effects or event/mutation boundaries, not dependency omission.
- Nest services that construct several external dependencies should be scheduled for provider/composition-root refactoring.

## Deferred Architecture Items

- Move GSC DB handle, Search Console adapter, token cipher, Redis connection, and queue construction into Nest providers.
- Add real readiness checks for DB/Redis/queue dependencies.
- Add GSC property selection instead of auto-selecting `properties[0]`.
- Tighten production route params and remove demo fallbacks when tenant/auth work starts.
- Add type-aware ESLint, React Hooks linting, and TanStack Query linting as a dedicated tooling slice.

## Source Classification

Authoritative:

- NestJS providers/controllers/validation/configuration/lifecycle/queues/Terminus/exception filters/testing docs.
- React rules of hooks, hooks linting, custom hooks, purity, error boundary, and Suspense docs.
- TanStack Query docs and ESLint plugin docs.
- Zod docs.
- MDN URL docs.
- typescript-eslint typed linting docs.

Inspiration only:

- Persson Dennis React anti-patterns article.
- DEV custom hooks article.
