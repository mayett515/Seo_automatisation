# Casebook: calibration anchors from repo stress tests

Read on demand during repo-review pass 3. These are observed findings, not
mandatory templates. The stable conclusion across all of them:

> The schema is strongest when code hides product or domain policy inside
> control flow. It is weakest on tiny pure utilities, framework glue, and
> generated code.

## Strong fits (extract the policy seam)

- **Cal.com booking limits** — candidate booking set and limit policy hidden
  in workflow code; strong because recurring limits must evaluate the whole
  candidate set.
- **Medusa order/returns** — custom-item vs variant-item and return
  eligibility revealed invalid domain assumptions once named.
- **Immich asset edit** — edit eligibility, crop-first, crop-bounds,
  unsupported formats became one testable decision.
- **Supabase Auth** — session initialization plan exposed URL-callback vs
  storage-recovery as distinct variants.
- **Firecrawl crawl controller** — option merge, credit limits, path-regex
  validation were policy seams inside a controller.

Pattern: extract the policy seam, keep the service class that owns
repositories/queues/lifecycle, keep procedure order intact.

## Medium fits (local, proportionate improvement)

- **Ant Design Upload** — the win was one `BeforeUploadDecision` union, not a
  lifecycle rewrite.
- **Excalidraw clipboard** — classification into mixed content / elements /
  plain text; parser outcomes as variants.
- **Vitest config resolver / Playwright worker precedence** — tooling
  resolvers stay procedural; only the policy seam gets a name.
- **Bluesky/ATProto** — unknown protocol records become validated internal
  variants before persistence.

## Weak fits (correct verdict: leave it alone)

- **MUI `createFilterOptions`, TanStack `hashKey`** — tiny pure utilities;
  extraction lowers readability.
- **n8n HTTP version registration** — framework glue, already correct.
- **XState internals** — already type-strategy-heavy; at most light naming.
- **Generated code** — touch only through its generator.

Weak categories: tiny pure utilities, infrastructure glue, framework
registration, highly optimized algorithm internals, type-level library
internals, generated code.
