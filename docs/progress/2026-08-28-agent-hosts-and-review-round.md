# 2026-08-28 - Agent host layer, and two external reviews of the lane concept

Scope: policy and check hooks wired into every agent host, a delegation skill,
the cross-host transfer written into the pack master, and the repairs that two
external reviews of the lane inventory forced. Branch `agent-hosts-delegation`,
commits `828c945` through `b79910e`.

State claims belong to `docs/agents/lanes/generated-map.md` and
`docs/agents/lanes/SCHEMA.md`; nothing here restates them.

## Decisions

- The lane inventory hook reports and never repairs. An edit with a downstream
  consequence should show it, and a hook that rewrites tracked files during
  someone else's edit is the invisible kind this layer exists to avoid.
- One shared hook body, one thin per-host extractor. Four copies of the logic
  would drift, and the copy that drifted would be the one that quietly stopped
  catching things.
- Reasonix runs the same policy scripts through an adapter rather than a second
  copy, so the two hosts cannot disagree about the rules.
- The lane hook entries in `.codex/hooks.json` and `.cursor/hooks.json` are a
  deliberate fork of verbatim pack copies, anchored in the regression guards so
  a pack re-adoption fails the build instead of removing them silently.
- `delegate-to-cli` stays in the project layer. Model names, budgets and
  installed binaries are machine-specific and fail the pack's portability test;
  the shape may be promoted once a second project uses it.
- Historical records keep the old machine path. A progress entry, a scout-run
  log and an ADR context describe the machine as it was; rewriting them would
  falsify a record rather than fix one.

## Commits

| Commit    | What it settles                                                                       |
| --------- | ------------------------------------------------------------------------------------- |
| `828c945` | Codex host layer installed from its pack, as that pack's own adoption steps prescribe |
| `80c3f99` | Reasonix gets the same write and shell policy through a translating adapter           |
| `7b1d835` | Delegation skill, and the pack-master gaps handed over as a finding                   |
| `330f667` | Lane inventory reported at the edit rather than at the gate                           |
| `daafbcd` | That hook wired into all five hosts from one shared body                              |
| `570b2a7` | The installed-is-not-running rule carried down from the pack                          |
| `49e71e4` | The hook widened from lanes to every check this repository owns                       |
| `94c74d8` | First review acted on: dead hook, proof check, map columns                            |
| `4856e6e` | Second review acted on: false column name, portable field paths, D3                   |
| `b79910e` | The same honest name carried into the contract, not only the map                      |

Upstream, `e032765` in `C:\claude\claude-workflows` records the cross-host
transfer and the general rule.

## What was proven, and how

Every mechanism here was watched failing before being trusted.

- Reasonix write policy: a write into `archive/` refused and an ordinary file
  created, both by real runs of the binary, after three translation layers were
  each wrong and silently permissive.
- Lane hook: each of five hosts fed its own payload shape against a broken
  inventory, and again against an unrelated file.
- Pack-fork anchors: observed failing with the `.codex/hooks.json` entry removed.
- Queue-producer guard: observed failing on a planted second producer.
- Path resolution and routing: `tools/agent-hooks/after-edit.test.ts`, including
  an assertion that the root is not the worker package.
- Directory-as-proof: `tools/lane-inventory/core.test.ts`.
- The three shell-emitted findings, named debt in the previous entry, now have
  direct tests. The intake moved out of the checker into
  `tools/lane-inventory/intake.ts` with the filesystem injected, so it can be
  exercised without running the checker; `intake.test.ts` covers all three, and
  removing each check in turn was observed turning two tests red.

Gates on the final commit: `format:check`, `text:check`, 47 tools tests, tools
typecheck, `lint` with 0 errors and 2 pre-existing TanStack warnings. No
database-backed suite was run locally this round.

## What the reviews caught that the gates did not

Four defects of one shape, all green, none found by a check:

1. The Reasonix hook reported itself active and enforced nothing - wrong tool
   name, wrong argument key, wrong path form, each silent.
2. Widening the after-edit hook changed its root marker to `node_modules/tsx`,
   which `apps/worker` installs for itself, so every lane check was skipped.
   Introduced and shipped by the author of the rule against it.
3. The map gained a column named `HTTP reachable` whose source proves only
   admission by the shared producer. `gsc-sync` disproves it.
4. That name was corrected in the generated map and left standing in the core,
   the shell comment, the finding code and `SCHEMA.md`.

The rule these break is in five trees. Knowledge was never the gap; the guards
are the only answer that does not rely on remembering.

## Open

- **GSC enqueue-path consolidation.** `gsc.module.ts` builds its own queue
  instead of enqueuing through `apps/api/src/queue-producer.ts`. Consolidating
  is the better architecture and is deferred, not declined: both sides record
  job runs, so it needs a database-backed integration proof. The seam is clean
  - `GscService` keeps `gscSyncRuns`, the producer owns `jobRuns` and delivery -
    so this is a slice, not a redesign. The contract fact is now named
    `sharedApiQueueNames`, which is true before and after.
- `main` is unprotected. Verified through the GitHub API in the previous round:
  no branch protection, no rulesets. Making `validate` a required check is the
  smallest step; `integration` only once it is confirmed to appear on every
  pull request.
- Carried forward: branded identifiers measured but not promoted, a hotspot
  report over size and change frequency, and a browser check for the navigation
  empty state.
