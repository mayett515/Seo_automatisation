FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --filter @localseo/worker... --frozen-lockfile

FROM deps AS runner
COPY apps/worker apps/worker
COPY packages/ai packages/ai
COPY packages/config packages/config
COPY packages/contracts packages/contracts
CMD ["pnpm", "--filter", "@localseo/worker", "dev"]

