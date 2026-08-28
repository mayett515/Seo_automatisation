# Rule system maintenance

Material for humans maintaining the agent layer — not required for ordinary implementation tasks.

## Shared native layer

- Root and nested `AGENTS.md` files are shared by Cursor and Codex; Claude Code additionally loads the root `CLAUDE.md`.
- Repeatable workflows live in `.agents/skills/`, which both hosts discover. Cursor invokes them with `/skill-name`; Codex can invoke them with `$skill-name`.
- Cursor-only rules, subagents, and hooks live in `.cursor/`. Codex-only counterparts live in `.codex/` when installed. The Claude-native layer lives in `CLAUDE.md` plus `.claude/` (17 path-scoped rules, 5 pack skills, the diff-reviewer subagent), copied verbatim from the pack master, plus four hooks wired in `.claude/settings.json`. Three of those hooks come from the pack (`protect-paths`, `guard-bash`, `post-edit-lint`); `post-edit-checks` is project-owned, because the checks it runs are this repository's own.
- `.agents/rules/` carries the same 17 path-scoped rules as a verbatim mirror of `.claude/rules/` for hosts that read that location (Antigravity/agy; Codex ignores it - it only reads `.agents/skills/`). Sync it from `.claude/rules/` when the pack updates, never by ad-hoc edits.
- `post-edit-checks` runs the repository's own checks immediately after an edit that could invalidate one, instead of leaving them all to the gate. The group is chosen by the edited path: an edit to a lane leaf, `lane-handler-registration.ts`, the contracts job registries, or a file under `docs/agents/lanes/` runs the lane inventory checker; an edit to `AGENTS.md`, `CLAUDE.md`, a rule or skill file, a host `hooks.json`, or anything under `docs/` runs the architecture regression guards and the text health check; an edit to either side of a rename - `tools/retired-identifiers/`, the contracts sources, a lane leaf, or a document under `docs/agents/` or `.ai-project-rules/` - runs the retired-identifier check. Run `corepack pnpm exec tsx --test tools/agent-hooks/after-edit.test.ts` for the current group list; the routing assertions there are the list, and a count frozen into this sentence would outlive its truth. Adding a group is a table entry in `tools/agent-hooks/after-edit.mjs` and nothing else. It adds no coverage - `text:check` runs the same scripts in CI and stays the authority. What it buys is latency, so a broken claim surfaces while the reason for the edit is still in context instead of at pull-request time, when a document tends to be adjusted to make a red check go green rather than because the claim in it was wrong. It reports and never repairs.
- All five hosts are wired, and only the extraction differs: the shared body lives once in `tools/agent-hooks/after-edit.mjs`, and each host contributes a few lines that pull the edited path out of its own payload - Claude `tool_input.file_path`, Cursor one of three keys, agy `toolCall.args.TargetFile`, Codex the `*** Add|Update|Delete File:` lines of an `apply_patch` command that carries no path at all, and Reasonix through the same adapter as its policy hooks. Every one was verified by breaking a check and watching it report, not by reading the wiring. The `post-edit-checks` entries in `.codex/hooks.json` and `.cursor/hooks.json` are a deliberate local fork of two verbatim pack copies, in the same spirit as the `disable-model-invocation` override recorded in ADR 0024: re-adopting either pack overwrites the file and silently takes the hook with it, leaving a host that looks wired and checks nothing, so `tools/check-architecture-regression-guards.ts` anchors both entries and the overwrite fails the build instead of passing quietly. Re-add the `PostToolUse` entry after any pack re-adoption.
- Not covered by any of these hooks: deleting a file from the shell. `rm` is a Bash call, not an edit, so no `PostToolUse` hook sees it and `text:check` in CI is the only thing that catches it. Named, not implied.
- Reasonix reads the root `AGENTS.md` tree and keeps its project hooks in `.reasonix/settings.json`, in a flat shape (`match`, `command`, `description`, `timeout`) that is not Claude's nested one. It does not run the `.claude/hooks/` scripts directly: its payload names the tool `write_file` (not `Write`), the argument `path` (not `file_path`), and the value is repo-relative where Claude's is absolute. `.reasonix/hooks/claude-policy-adapter.mjs` translates all three and delegates, so `guard-bash.mjs` and `protect-paths.mjs` stay the single owner of the policy. Each of the three was wrong at some point during wiring and none of them raised anything: the target script found no field it knew, exited 0, and every call was allowed while `reasonix hook list` reported the hook as `active`. `tools/reasonix-policy-adapter.test.ts` pins all three; when adding a tool to the adapter, probe the real payload with a temporary hook rather than guessing the names.
- Qwen does not read `.agents/skills/` on its own. It sees the shared skills only when the user-level `~/.qwen/settings.json` sets `skills.directories` to this repository's `.agents/skills` path (verified against qwen 0.22.0; the value is ignored in bare and safe mode). That is per-machine configuration: a fresh clone does not carry it and no repository check can verify it, so wire it once per machine.
- Skill ownership: `.agents/skills/` is canonical for the eleven project skills listed below. Names that arrive from the vendored pack below are owned by that pack in both trees. `.claude/skills/` mirrors the pack master's five generic skills for Claude-native discovery; where a name exists in both trees, the pack lineage owns `.claude/` and the shared lineage owns `.agents/` — sync deliberately through pack updates, never by ad-hoc edits.
- Precedence when layers overlap: the more specific layer wins — nested `AGENTS.md` and `.ai-project-rules/` over the root file, and this root file over the generic pack rules (`.claude/rules/`, `.agents/rules/`). The layers restate one doctrine at different zoom levels; on genuine conflict, the most specific statement is authoritative.
- Project skills available: anti-regression, repo-review, smoke-verify, source-of-truth-audit, type-interview, oauth-security-review, deployment-preflight, local-page-quality, mermaid-diagrams, inspiration-pass, delegate-to-cli.
- `delegate-to-cli` covers handing a task to another CLI agent and adjudicating what comes back; it is kept in both skill trees because both Claude Code and Codex/Cursor may be the delegating session. It is deliberately distinct from the cross-host configuration layer above: that answers which files a host reads, this answers how to brief a host and check its output. Its `references/hosts.md` holds invocation syntax, the reach table, and the traps that have already cost time or money.
- Vendored pack skills, user-invoked (only when you type them): ask-matt, grill-me, grill-with-docs, triage, wayfinder, to-spec, to-tickets, implement, improve-codebase-architecture, handoff, teach, to-questionnaire, wait-what, setup-matt-pocock-skills.
- Vendored pack skills, model-invoked (an agent may also reach for them): tdd, codebase-design, diagnosing-bugs, domain-modeling, grilling, resolving-merge-conflicts.
- Vendored pack skills restricted to explicit invocation by a local override: code-review, research, prototype. They carry a hand-added `disable-model-invocation: true` so no agent reaches for them unasked. `npx skills update` reverts that line; re-apply it and check ADR 0024 before trusting a fresh install.
- Removed from the vendored set on purpose: wizard and writing-for-agents. Do not reinstall them. `ask-matt` and `wayfinder` still mention wizard in prose; that pointer is dead.
- Decision records live only in `docs/architecture/decisions/`. Vendored pack skills default to `docs/adr/`; that directory must not be created. When a pack skill offers an ADR, write it into the existing log with the existing `TEMPLATE.md`.
- `docs/agents/domain.md` is the per-repo configuration the vendored pack reads for glossary and decision-log locations. It overrides the pack's own defaults; change it there, not in a vendored skill.
- Research notes an agent produces go where this repo already keeps them: `.ai-stack-findings/` for official-doc and API facts, `.ai-stealer-findings/` for patterns mined from other repositories, both named `YYYY-MM-DD-slug.md`. The pack's `research` skill only says "where the repo already keeps such notes", so name the folder when you ask for it.
- Vocabulary precedence over the vendored pack: `codebase-design` advises against the word "boundary", but this project is built on it. The project term wins; the deep-module terms (depth, seam, leverage, locality) are additive.
- Run `/setup-matt-pocock-skills` once per clone before using the vendored engineering flow. It records the issue tracker, the triage labels, and the docs location that the other pack skills read.
- Vendored third-party pack: the `mattpocock/skills` set (23 of 25 skills, see ADR 0024) is installed with `npx skills add mattpocock/skills` as ordinary copies in both `.claude/skills/` (Claude Code) and `.agents/skills/` (Codex, Cursor), with `skills-lock.json` at the repo root recording the source hashes. Refresh it with `npx skills update`, not by hand-editing the copies: a hand edit forks the pack and the next update overwrites it. The only sanctioned exception is the `disable-model-invocation` override on the three skills listed above, recorded in ADR 0024. The pack ships a `code-review` skill whose name also exists as a Claude Code built-in, so say which one you mean when it matters.

## Agent skills pointers

- Issue tracker: GitHub Issues via the `gh` CLI — see `docs/agents/issue-tracker.md`.
- Triage labels: canonical role names — see `docs/agents/triage-labels.md`.
- Domain docs: glossary and decision log — see `docs/agents/domain.md`.

## Archive (retired rule bundles)

These bundles were migrated into the native layer and moved to `archive/`; the coverage ledger is `archive/MIGRATION-LEDGER.md`:

- `.ai-planning-rules` — superseded by plan-mode discipline and the pack factory
- `.ai-diagram-rules` — now the `mermaid-diagrams` skill
- `.ai-stealer-rules` — now the `inspiration-pass` skill
- `.ai-stack-rules`, `.ai-nest-rules`, `.ai-fastify-rules` — merged into the reusable TypeScript pack and the nested `AGENTS.md` files
- `.ai-schema-factory` — superseded by the pack factory

Archived material never loads automatically. Archived bundles are immutable; the coverage ledger receives controlled amendments outside Cursor sessions. To consult the archive, ask explicitly. New lessons go into the native layer, never into the archive.

## Frozen references

- `.ai-rules/` is a frozen reference copy of the retired TypeScript rule bundle; the native layer plus reusable packs are canonical for TypeScript work.
- Generic TypeScript rule authoring is owned upstream by the pack master `C:\claude\claude-workflows\typescript`; update the pack first, then sync the host layers. The historical authority at `C:\Scheme\pragmatic_typescript_v3_ai_rules_bundle_complete\` is retired.
- `.ai-stealer-catalog/` is the stable seed catalog for repo-catalog research.
- `.ai-stealer-findings/` is the editable place for new discovered sources and extracted patterns.
- `.ai-stack-findings/` is the editable place for stack-doc findings before they become pack rules.
- `.ai-project-references/` contains local frontend inspiration and field-evidence artifacts.
- Do not edit frozen/reference seed folders during normal project work.
- Put project-specific behavior in `.ai-project-rules/` or the native layer, never in frozen bundles.

## Promotion matrix (findings → rules)

Mechanically checkable → lint/hook/CI or guard script; project-wide invariant → root `AGENTS.md`; location-bound convention → nested `AGENTS.md`; repeatable procedure → `.agents/skills/`; architecture decision → ADR; stack-generic → pack master. Never promote into `archive/`.

## Hard rules (meta)

- Do not add SEO/product/planning rules to `.ai-rules/`.
- Do not duplicate TypeScript audit modes as Codex subagents unless explicitly requested.
- Do not use ADRs as a running changelog; use `docs/progress/` for chronological progress notes.
