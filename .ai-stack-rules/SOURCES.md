# Stack Rule Sources

These sources are stack implementation guidance. They do not override product truth, architecture direction, or the frozen `.ai-rules` TypeScript schema.

Use these as the first-pass refresh list when a review finds a recurring stack mistake. New sources go into `.ai-stack-findings/` first; promote them into this file only after they prove useful and stable.

- TypeScript typed linting: https://typescript-eslint.io/getting-started/typed-linting/
- TypeScript parameter properties: https://typescript-eslint.io/rules/parameter-properties/
- React purity and render rules: https://react.dev/reference/rules/components-and-hooks-must-be-pure
- React rules of hooks: https://react.dev/reference/rules/rules-of-hooks
- React hooks linting: https://react.dev/reference/eslint-plugin-react-hooks
- React custom hooks: https://react.dev/learn/reusing-logic-with-custom-hooks
- React error boundaries: https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
- React Suspense: https://react.dev/reference/react/Suspense
- React anti-patterns article (inspiration, not authority): https://www.perssondennis.com/articles/react-anti-patterns-and-best-practices-dos-and-donts
- Custom hooks article (inspiration, not authority): https://dev.to/austinwdigital/mastering-custom-react-hooks-best-practices-for-clean-scalable-code-40b1
- TanStack Query states: https://tanstack.com/query/v5/docs/framework/react/guides/queries
- TanStack Query keys: https://tanstack.com/query/v5/docs/framework/react/guides/query-keys
- TanStack mutation invalidation: https://tanstack.com/query/v5/docs/framework/react/guides/invalidations-from-mutations
- TanStack Query ESLint plugin: https://tanstack.com/query/v5/docs/eslint/eslint-plugin-query
- TanStack Router path params: https://tanstack.com/router/latest/docs/guide/path-params
- TanStack CLI repo and skill spec: https://github.com/TanStack/cli
- TanStack CLI agent skills (optional personal references, not required repo dependencies):
  - `C:\Users\muell\.codex-personal\skills\query-docs-library-metadata\SKILL.md`
  - `C:\Users\muell\.codex-personal\skills\create-app-scaffold\SKILL.md`
  - `C:\Users\muell\.codex-personal\skills\add-addons-existing-app\SKILL.md`
  - `C:\Users\muell\.codex-personal\skills\choose-ecosystem-integrations\SKILL.md`
  - `C:\Users\muell\.codex-personal\skills\maintain-custom-addons-dev-watch\SKILL.md`
- Project-owned TanStack ecosystem schema: `.ai-stack-rules/09-tanstack-ecosystem-schema.md`
- NestJS providers: https://docs.nestjs.com/providers
- NestJS controllers: https://docs.nestjs.com/controllers
- NestJS custom providers: https://docs.nestjs.com/fundamentals/custom-providers
- NestJS testing module: https://docs.nestjs.com/fundamentals/testing
- NestJS validation: https://docs.nestjs.com/techniques/validation
- NestJS configuration: https://docs.nestjs.com/techniques/configuration
- NestJS lifecycle events: https://docs.nestjs.com/fundamentals/lifecycle-events
- NestJS queues: https://docs.nestjs.com/techniques/queues
- NestJS Terminus health checks: https://docs.nestjs.com/recipes/terminus
- NestJS exception filters: https://docs.nestjs.com/exception-filters
- NestJS Fastify/performance: https://docs.nestjs.com/techniques/performance
- NestJS HTTP adapter: https://docs.nestjs.com/faq/http-adapter
- Fastify docs: https://fastify.io/docs/latest/
- Fastify recommendations: https://fastify.io/docs/latest/Guides/Recommendations/
- MDN URL constructor: https://developer.mozilla.org/en-US/docs/Web/API/URL/URL
- MDN URL.canParse: https://developer.mozilla.org/en-US/docs/Web/API/URL/canParse_static
- Google OAuth best practices: https://developers.google.com/identity/protocols/oauth2/resources/best-practices
- Microsoft/Azure API design: https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design
- Drizzle ORM schema declaration: https://orm.drizzle.team/docs/sql-schema-declaration
- Drizzle ORM migrations: https://orm.drizzle.team/docs/migrations
- Mastra agents overview: https://mastra.ai/docs/agents/overview
- Mastra workflows overview: https://mastra.ai/docs/workflows/overview

Local read-only stack references:

- `C:\total typescript\total_typescript_learning_path\modules\05_advanced_typescript_patterns\index.md`
- `C:\total typescript\total_typescript_learning_path\modules\06_zod\index.md`
- `C:\total typescript\total_typescript_learning_path\modules\07_react_with_typescript\index.md`
- `C:\total typescript\total_typescript_learning_path\modules\08_advanced_react_with_typescript\index.md`
- `C:\total typescript\React_Patterns_Karteikarten\Index.md`
