# 0004 - NestJS Production Builds And Decorator Metadata

Date: 2026-06-25
Status: Accepted
Category: Backend, Deployment, DX
Source: Review finding, NestJS runtime behavior, TypeScript compiler behavior

## Context

The API and worker are built with NestJS/Fastify and run in Node. NestJS relies on decorators and runtime metadata for dependency injection, controllers, providers, guards, pipes, and modules.

The app/worker `build` scripts started as typecheck-style checks. The production build slice now emits JavaScript artifacts for shared packages, API, and worker with TypeScript `tsc`.

A review suggested using a generic bundler-style build. That is risky for this backend unless we deliberately verify decorator metadata and Nest dependency injection behavior.

## Decision

For backend production builds, use TypeScript `tsc` emit first.

The API and worker production build path must preserve:

- decorators
- `emitDecoratorMetadata`
- Nest module/provider/controller metadata
- ESM package compatibility
- runtime imports used by the monorepo packages

Do not switch API/worker production builds to `tsup`, `esbuild`, Vite, or another bundler just because it is faster.

Bundlers are allowed only after a dedicated verification pass proves:

- Nest providers still resolve through DI
- controllers and decorators still work at runtime
- worker entrypoints run under the production command
- package imports resolve correctly from built output
- smoke checks pass against the built API/worker artifacts

## Consequences

The first production build implementation is slower than a bundled build, but it is less likely to break Nest runtime behavior.

The root `build` command now emits backend/package `dist/` artifacts and builds the web app. API/worker production commands run:

```text
node --conditions=production dist/main.js
```

The `production` condition makes shared workspace packages resolve to built JS instead of TypeScript source.

## Alternatives Considered

### Keep `--noEmit` Forever

Rejected for deployment. It checks types, but it does not produce artifacts for AWS/Fargate.

### Use `tsup`/`esbuild` Immediately

Deferred. Fast bundlers are attractive, but decorator metadata and module resolution must be proven before using them for Nest API/worker production builds.

### Run TypeScript Directly In Production With `tsx`

Deferred. It can simplify early deployment, but it pushes compile/runtime responsibility into the production container and should be an explicit infrastructure decision.

## Regression Guard

Do not treat a passing `tsc --noEmit` backend check as proof that the API/worker are deployable.

Do not introduce backend bundling unless the verification plan includes Nest DI, decorator metadata, worker startup, package resolution, and runtime smoke checks.

## Related Files

- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/worker/package.json`
- `apps/worker/tsconfig.json`
- `tsconfig.base.json`
- `.ai-nest-rules/01-providers-composition-root.md`
- `.ai-nest-rules/03-queues-workers-lifecycle.md`
