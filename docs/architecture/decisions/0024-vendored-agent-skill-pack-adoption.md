# 0024 - Vendored Agent Skill Pack Adoption

Date: 2026-08-23
Status: Accepted

## Context

The `mattpocock/skills` pack was vendored into this repository so the same
workflows are reachable from Claude Code, Codex, and Cursor. It arrived as 25
skills copied into `.claude/skills/` (Claude Code) and `.agents/skills/`
(Codex, Cursor), with `skills-lock.json` at the repository root recording the
source hashes.

Three problems surfaced during adoption.

First, eleven of the vendored skills were model-invocable, meaning an agent
could reach for them without being asked. Five of those could write into the
repository unprompted: `domain-modeling` creates a glossary and ADR files,
`research` writes a findings document, `prototype` places throwaway code next
to production code, `wizard` generates a shell script, and
`writing-for-agents` edits `AGENTS.md` and `CLAUDE.md`. Unprompted file
creation in a repository with an established layout is a regression risk, not
a feature.

Second, several vendored skills overlap skills this repository already owns:
`code-review` against `anti-regression` and the `diff-reviewer` subagent (and
against the Claude Code built-in of the same name),
`improve-codebase-architecture` against `repo-review`, `domain-modeling`
against `type-interview`, `tdd` against `.claude/rules/testing.md`, and
`diagnosing-bugs` against `smoke-verify`.

Third, the pack hardcodes `docs/adr/` as the decision-record location. This
repository has kept its decision log in `docs/architecture/decisions/` since
ADR 0001, with a README, a template, and a pointer from `AGENTS.md`. Letting
the pack create a second ADR directory would fork the decision log.

## Decision

Keep the repository's own skills as the primary instruments. Take the pack for
what it adds rather than what it duplicates.

**Removed outright** (deleted from both trees and from `skills-lock.json`):

- `wizard`: generates shell scripts unprompted, and no other skill depends on
  it beyond a prose mention in `ask-matt`.
- `writing-for-agents`: model-invocable and triggered by edits to `AGENTS.md`
  and `CLAUDE.md`, which is precisely the layer this project governs itself.

**Kept but restricted to explicit invocation.** A local
`disable-model-invocation: true` is added to the vendored frontmatter of
`research`, `prototype`, and `code-review`. They stay fully usable when typed,
but no agent reaches for them on its own. This is a deliberate fork of three
vendored files: `npx skills update` will revert it, and the revert must be
re-applied.

**Kept as shipped**: the remaining skills, including the fourteen that already
ship as user-invoked only, plus the model-invocable references that write
nothing (`codebase-design`, `tdd`, `grilling`, `diagnosing-bugs`,
`resolving-merge-conflicts`, `domain-modeling`).

**Decision records stay in `docs/architecture/decisions/`.** Vendored skills
that offer to write an ADR use that directory and the existing `TEMPLATE.md`.
`docs/adr/` is not created and must not be created.

**Overlap resolution**: `anti-regression`, `repo-review`, `smoke-verify`,
`type-interview`, and the `diff-reviewer` subagent remain authoritative for
review, architecture assessment, runtime verification, and type design. The
vendored counterparts are additional modes, not replacements. Where the
vendored version carries an idea the local skill lacks, that idea is grafted
into the local skill upstream in the pack master, never by hand-patching a
copy in this repository.

Two grafts were made on that basis. `diff-reviewer` gained a **Spec fidelity**
section: the five severity checks ask whether the code is sound, not whether it
is the code that was asked for, and the section reports that second question
separately so neither verdict hides the other. `repo-review` pass 1 gained
commit-history scoping: file size says where the code is, change frequency says
where the cost is, and where they disagree the churning path is reviewed first.
Both were written into the pack master at
`C:\claude\claude-workflows\typescript` and copied back byte-identical, with the
shorter shared-lineage variants in `.cursor/agents/diff-reviewer.md` and
`.agents/skills/repo-review/SKILL.md` brought in line.

**Vocabulary precedence**: `codebase-design` advises against the word
"boundary". This project's doctrine is built on it (`smallest honest
boundary`, `.claude/rules/boundaries.md`, `http-boundaries.md`,
`zod-boundaries.md`). The project vocabulary wins; the deep-module terms
(depth, seam, leverage, locality) are additive.

## Consequences

Easier: a spec-to-ticket-to-implement pipeline (`grill-with-docs`, `to-spec`,
`to-tickets`, `implement`, `wayfinder`, `triage`, `handoff`) that this
repository did not have, reachable from all three agent hosts through one
vendored copy.

Accepted costs: three vendored files carry a local frontmatter override that a
pack update silently reverts. The vendored engineering skills read
`docs/agents/issue-tracker.md`, which does not exist until
`/setup-matt-pocock-skills` is run, so they will ask for it until then.
`ask-matt` and `wayfinder` still mention the removed `wizard` in prose, which
is a dangling pointer with no runtime effect.

Follow-up work: run `/setup-matt-pocock-skills` once and answer the docs
question with `docs/architecture/decisions/`. Decide separately whether this
repository wants a `CONTEXT.md` glossary, which it currently lacks; the pack's
`grill-with-docs` is the intended way to start one against a real topic rather
than fabricating it.

## Alternatives Considered

Installing the pack as a Claude Code plugin (`/plugin install
mattpocock-skills`). Rejected: a plugin is Claude-only and read-only, and
Codex and Cursor would get nothing.

Leaving all eleven model-invocable skills as shipped. Rejected: four of them
create files without being asked, and one of those edits the project's own
agent instructions.

Deleting the overlapping vendored skills instead of keeping them as secondary
modes. Rejected for `improve-codebase-architecture` and `tdd`, which conflict
with nothing and add real technique. Rejected for `code-review` because
`implement` closes out by calling it.

Grafting the pack's deletion test ("would deleting this module concentrate
complexity, or just move it?") into `repo-review`. Rejected: the project's
ceremony test already fails a thin pass-through module, so the deletion test
would have added vocabulary without adding a verdict.

Adopting the pack's `docs/adr/` convention alongside the existing log.
Rejected: two decision directories means two places to look and neither is
authoritative.

## Regression Guard

- no second ADR directory: decision records live only in
  `docs/architecture/decisions/`
- no vendored pack file edited by hand except the three documented
  `disable-model-invocation` overrides, and each of those is re-checked after
  `npx skills update`
- no model-invocable skill that writes into the repository without being
  asked
- no vendored skill treated as the authority where a project-owned skill
  covers the same question
- no pack vocabulary overriding the project's own terms, "boundary" in
  particular

## Related Files

- `AGENTS.md`
- `skills-lock.json`
- `.claude/skills/` and `.agents/skills/`
- `.claude/agents/diff-reviewer.md`
- `.cursor/agents/diff-reviewer.md`
- `docs/agents/domain.md`
- `tools/check-architecture-regression-guards.ts` (the vendored-skill-pack category enforces this ADR's Regression Guard section)
- `docs/progress/2026-08-23.md`
- `docs/architecture/decisions/README.md`
