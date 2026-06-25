# Stack Rule Sources

These sources are stack implementation guidance. They do not override product truth, architecture direction, or the frozen `.ai-rules` TypeScript schema.

Use these as the first-pass refresh list when a review finds a recurring stack mistake. New sources go into `.ai-stack-findings/` first; promote them into this file only after they prove useful and stable.

- TypeScript typed linting: https://typescript-eslint.io/getting-started/typed-linting/
- TypeScript parameter properties: https://typescript-eslint.io/rules/parameter-properties/
- React purity and render rules: https://react.dev/reference/rules/components-and-hooks-must-be-pure
- React hooks linting: https://react.dev/reference/eslint-plugin-react-hooks
- TanStack Query states: https://tanstack.com/query/v5/docs/framework/react/guides/queries
- TanStack Query keys: https://tanstack.com/query/v5/docs/framework/react/guides/query-keys
- TanStack mutation invalidation: https://tanstack.com/query/v5/docs/framework/react/guides/invalidations-from-mutations
- TanStack Router path params: https://tanstack.com/router/latest/docs/guide/path-params
- NestJS providers: https://docs.nestjs.com/providers
- NestJS custom providers: https://docs.nestjs.com/fundamentals/custom-providers
- NestJS testing module: https://docs.nestjs.com/fundamentals/testing
- MDN URL constructor: https://developer.mozilla.org/en-US/docs/Web/API/URL/URL
- MDN URL.canParse: https://developer.mozilla.org/en-US/docs/Web/API/URL/canParse_static
- Google OAuth best practices: https://developers.google.com/identity/protocols/oauth2/resources/best-practices
- Microsoft/Azure API design: https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design
