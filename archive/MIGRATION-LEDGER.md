# Migration ledger: retired rule bundles → native layer

Date: 2026-08-22. Verbs are honest: **covered** (content verifiably present at
the named destination), **lifted** (was missing natively, added in this
change), **dropped** (passed the drop test: describes how a language, library,
or tool behaves — not a decision this project made), **superseded** (the job
is now done by a different mechanism). Nothing was deleted; every bundle is
readable here on explicit request and protected against edits by the Cursor
hooks.

Canonical upstream for generic TypeScript content: the pack master at
`C:\claude\claude-workflows\typescript` (its `MIGRATION.md` carries the
per-file ledger for `.ai-rules` and the stack bundles' generic halves).

## .ai-planning-rules (2 files)

| Content                                                                    | Verdict                                                                                                     |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Blueprint before compiling multi-file rule systems; explicit approval gate | superseded: `pack-architect` factory skill (interview → blueprint → approval → compile) and host plan modes |
| Flat-folder / 15-rule-budget / YAML+XML format doctrine                    | dropped: Codex-era delivery folklore; documented in pack MIGRATION.md                                       |
| Upstream-authority declaration (C:\Scheme → .ai-rules)                     | superseded: pack master is the authority; root AGENTS.md and guard updated in this change                   |

## .ai-diagram-rules (2 files)

All content **covered** by the new `.agents/skills/mermaid-diagrams/SKILL.md`:
type-choice table, one-question-per-diagram restraint, human-readable labels,
never omit approval/deploy/verification gates, deliver diagram + placement +
reading guide. Nothing dropped.

## .ai-stealer-rules (4 files)

Workflow, checkpoints, skip conditions, catalog entry points, aisles, and the
Local SEO checkpoint map are **covered** by the new
`.agents/skills/inspiration-pass/SKILL.md`. `03-architecture-decision-domains`
is referenced by the skill's step 2 (domain scan) in condensed form; the full
domain list remains readable in the archive. `.ai-project-rules/06` was
repointed from the retired checkpoint file to the skill. Catalog and findings
folders (`.ai-stealer-catalog/`, `.ai-stealer-findings/`) stay live — they are
data, not rules.

## .ai-stack-rules (11 files)

Generic halves **covered** by the TypeScript pack (see pack MIGRATION.md
"Second wave"): react.md, tanstack.md, auth-security.md, zod-boundaries.md,
smoke-verify skill, anti-regression promotion discipline. Repo-local halves
covered by nested AGENTS.md. **Lifted in this change** into `apps/api/AGENTS.md`:
GETDEL-atomic nonce consumption, state-signing-key separation,
GSC-OAuth-is-not-login, Better-Auth single-instance mounting. SOURCES.md link
lists dropped (link-rot; the anti-regression skill mandates checking current
official docs before promoting lessons).

## .ai-nest-rules (9 files)

Generic halves **covered** by the pack (nest.md, async-concurrency.md,
http-boundaries.md, testing.md, error-modeling.md). Repo halves covered by
`apps/api/AGENTS.md` and `apps/worker/AGENTS.md`. **Lifted in this change**
into `apps/worker/AGENTS.md`: transaction/staging-swap for delete-reinsert
retries, `rediss://` TLS, the status-honesty vocabulary
(queued/completed/failed/dry_run/not_configured/pending), plus a pointer to
the deep durable-run invariants in `.ai-project-rules/06` and `15` (which stay
live). Project-specific guard/tenancy details (Better-Auth wiring,
demo-project scaffold gates, x-project-id bans) are covered by
`apps/api/AGENTS.md` (wiring) and remain enforced by existing tests and the
live `.ai-project-rules` shards.

## .ai-fastify-rules (8 files)

Generic halves **covered** by the pack's fastify-adapter.md (adapter ≠
architecture, central plugins, no dual Zod/JSON-schema truth, hooks only for
what Nest does not own). **Lifted in this change** into `apps/api/AGENTS.md`:
`trustProxy` topology rule and route-class-specific rate limits. Better-Auth
mounting lifted as above. SOURCES.md dropped (same reason as stack).

## .ai-schema-factory

**Superseded** by the pack factory in `C:\claude\claude-workflows`
(pack-architect, scheme-port, pack-audit). Its bundled skill set
(schema-architect, schema-to-codex, …) was never wired into this repo's
native layer and is kept purely as history.

## Still live (deliberately NOT archived)

- `.ai-rules/` — frozen reference (guard-pinned content anchors; canonical
  work now happens in the pack master). Archiving is a later step after the
  guard's `.ai-rules` content anchors are retired.
- `.ai-project-rules/` — active product layer (54 guard assertions,
  incident-derived depth that nested AGENTS.md deliberately does not
  duplicate). Migration of this bundle is its own future step with its own
  ledger.
- `.ai-stealer-catalog/`, `.ai-stealer-findings/`, `.ai-stack-findings/`,
  `.ai-project-references/` — reference data, not rules.

## Amendments (2026-08-22, after the Codex cross-review)

An independent Codex review sampled the coverage claims. Accepted findings,
fixed the same day:

- stack-05: "access tokens in memory only" was not at a named runtime target;
  lifted into `apps/api/AGENTS.md`. The blanket "covered" was overclaimed.
- fastify-06: edge-ownership split (TLS/redirects/compression/multi-domain at
  the proxy, per-deployment ownership documentation) and "check current
  Fastify recommendations before timeout/proxy/compression/static/scaling
  changes" were missing; lifted into `apps/api/AGENTS.md`.
- stealer-03: the architecture-decision domain scan was claimed as condensed
  but absent; now an explicit step in the `inspiration-pass` skill, reading
  the archived domain map on demand.
- Worker status-honesty wording was over-absolute and contradicted the live
  admission/reservation invariants (`.ai-project-rules/06`, `15`); reworded
  to permit durable intent/run/reservation rows before enqueue.
- Archive protection: Cursor `Write`/`Delete` tool calls into `archive/` are
  denied with resolved-path normalization (this ledger included). Shell
  execution cannot be fully policed — the command regex is defense-in-depth
  only, so the guarantee is scoped to the file-tool layer. Controlled
  amendments to this ledger happen outside Cursor sessions.
- Root `AGENTS.md` now carries the generic Pragmatic TypeScript layer
  natively (previously only in the external pack, which does not exist on
  every machine): the pack remains the authoring master, the repo carries
  the runtime copy.
- The Cursor lint hook moved from `afterFileEdit` (documented observe-only)
  to `postToolUse` with `additional_context` output, per current Cursor docs.
