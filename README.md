# Local SEO Platform

Local SEO SaaS scaffold using the project rule system in `AGENTS.md`.

## Stack

```text
Frontend: React + TypeScript + TanStack Router/Query/Form/Table/Store/Virtual
Backend: NestJS + Fastify
Workers: BullMQ + Mastra workflow/agent host
Data: Drizzle + PostgreSQL, Redis, object storage
Deploy: Netlify frontend/customer sites, AWS Fargate backend/workers
```

## Commands

```powershell
corepack pnpm install
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm build
corepack pnpm test
```

## Rule Routing

Start from `AGENTS.md`. The TypeScript rules live in `.ai-rules/`; Local SEO product rules live in `.ai-project-rules/`.

## Decision Log

Human-readable architecture decisions live in [docs/architecture/decisions](docs/architecture/decisions).

## Progress Log

Chronological project progress lives in [docs/progress](docs/progress).
