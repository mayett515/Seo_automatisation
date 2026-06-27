---
description: "Fastify plugin and ecosystem selection rules for official plugins, Nest ownership boundaries, and approval before dependency changes"
globs: "apps/api/**/*.{ts,tsx,json}, package.json, pnpm-lock.yaml, **/*fastify*.md"
alwaysApply: false
version: "1.0.0"
model_target: "universal-router-hybrid"
protocol_compat: "mcp: 2026-05"
dependencies:
  - "https://fastify.dev/ecosystem/"
  - "https://fastify.dev/docs/latest/Guides/Ecosystem/"
  - "https://fastify.dev/docs/latest/Guides/Recommendations/"
  - "https://better-auth.com/docs/integrations/fastify"
priority_schema: "critical > strong > guideline"
---

# Plugins And Ecosystem

<positive-directives>
- Prefer official Fastify plugins from the Fastify ecosystem when a plugin is needed.
- Check whether Nest already provides the concern before adding a Fastify plugin.
- Record plugin choices, configuration defaults, security implications, and ownership boundaries.
- Ask before installing dependencies or registering new runtime plugins.
- Keep plugin registration centralized near bootstrap or a dedicated infrastructure module.
- Use Fastify auth/cookie/CORS/security plugins only for adapter-level behavior; product authorization remains in Nest guards.
- Use maintained Fastify plugins for adapter-level security headers and rate limits when production HTTP traffic is exposed.
- Mount Better Auth HTTP routes at the Fastify adapter boundary while exposing the same Better Auth instance to Nest guards through DI.
</positive-directives>

<absolute-constraints>
- DO NOT add random Fastify ecosystem plugins without checking maintenance, compatibility, and whether Nest owns the concern.
- DO NOT register plugins ad hoc inside feature services.
- DO NOT let plugin behavior bypass Nest guards, validation, CORS policy, logging policy, or tenant isolation.
- DO NOT install a Fastify auth/security plugin without documenting whether Nest or Better Auth already owns that concern.
- DO NOT wrap Better Auth auth endpoints in feature controllers when the raw Fastify handler is the cleaner cookie/session boundary.
</absolute-constraints>

<conditional-logic>
IF a Fastify plugin overlaps with a Nest module/feature:
THEN prefer the Nest abstraction unless Fastify runtime behavior is explicitly required.

IF a plugin handles security, cookies, multipart, static files, compression, or CORS:
THEN document production defaults and test the affected route behavior.

IF adding rate-limit, helmet, body-limit, or proxy behavior:
THEN configure it at bootstrap or infrastructure level and keep product authorization in Nest guards.

IF Better Auth requires a Fastify handler, cookie behavior, or CORS compatibility:
THEN keep the handler/runtime plumbing isolated and keep project authorization in Nest guards.

IF Better Auth auth routes are mounted:
THEN use route-appropriate auth rate limits and do not let auth route plumbing create a second auth configuration.
</conditional-logic>
