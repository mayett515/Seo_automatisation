FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN pnpm install --filter @localseo/api... --frozen-lockfile

FROM deps AS runner
COPY apps/api apps/api
COPY packages/config packages/config
COPY packages/contracts packages/contracts
COPY packages/domain packages/domain
EXPOSE 4000
CMD ["pnpm", "--filter", "@localseo/api", "dev"]

