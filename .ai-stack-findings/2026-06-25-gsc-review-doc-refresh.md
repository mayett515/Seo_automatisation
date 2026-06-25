# 2026-06-25 GSC Review Doc Refresh

Trigger: Opus/GPT review of the Google Search Console vertical slice.

Official sources checked:

- typescript-eslint typed linting: https://typescript-eslint.io/getting-started/typed-linting/
- React hooks linting: https://react.dev/reference/eslint-plugin-react-hooks
- TanStack Query states: https://tanstack.com/query/v5/docs/framework/react/guides/queries
- TanStack Query ESLint plugin: https://tanstack.com/query/v5/docs/eslint/eslint-plugin-query
- TanStack Router path params: https://tanstack.com/router/latest/docs/guide/path-params
- NestJS providers: https://docs.nestjs.com/providers
- MDN URL constructor: https://developer.mozilla.org/en-US/docs/Web/API/URL/URL
- Microsoft/Azure API design: https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design

Promoted into `.ai-stack-rules/`:

- Explicit TanStack Query pending/error/success state handling.
- Encode route params when manually constructing frontend API URLs.
- Avoid direct `new URL(...)` parsing in render paths.
- Keep Nest runtime DI smoke checks after provider/controller changes.
- Replace/revoke old OAuth refresh tokens on reconnect.
- Normalize provider errors before persisting or exposing them.
- Check official docs and adjacent guidance during future stack reviews.

Candidate findings to revisit later:

- Add TanStack Query ESLint plugin when linting is configured.
- Tighten demo route-param fallbacks before production authorization work.
- Add explicit API versioning rules if external partner/client APIs become public.
- Add worker idempotency and retry semantics as a dedicated stack rule if more queue flows are built.
