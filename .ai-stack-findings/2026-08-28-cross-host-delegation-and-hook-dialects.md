# Cross-host: three hosts missing from the model, and a hook dialect that fails silently

Prepared for the pack master (`C:\claude\claude-workflows`), which is not edited
by agents. Everything below is either verified on this machine on 2026-08-28 or
marked as unverified. Nothing here is a rule yet.

## 1. The cross-host model covers three hosts; six are in use

`docs/cross-host-model.md` fills its six placement slots for Claude Code, Codex
and Cursor. Three further hosts are in daily use against this repository and
appear nowhere in it: Antigravity (`agy`), qwen, and Reasonix. They are not
exotic — they are where bulk work is sent, which means they are precisely the
hosts most likely to act on a rule they never loaded.

Proposed rows, verified by probing rather than by reading their marketing:

| Slot           | agy                                                                                | qwen                                                               | Reasonix                              |
| -------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------- |
| Always-on      | root `AGENTS.md` / `GEMINI.md`                                                     | root `AGENTS.md` only                                              | root `AGENTS.md` tree                 |
| Per file class | `.agents/rules/*.md`, four activation modes (always, glob, model-decision, manual) | none                                                               | none                                  |
| Workflows      | `.agents/skills/` natively                                                         | only via user-level `~/.qwen/settings.json` → `skills.directories` | not discovered                        |
| Review persona | unverified                                                                         | unverified                                                         | unverified                            |
| Hooks          | none in print mode (measured)                                                      | unverified                                                         | `.reasonix/settings.json` — see below |
| Checks         | identical everywhere                                                               | ←                                                                  | ←                                     |

Two asymmetries deserve to sit next to the existing "key asymmetries" list:

- **Nested `AGENTS.md` is unreliable for agy and qwen.** The existing model
  already notes that Codex needs a prose one-hop note; for these two the nested
  file may not be read at all. A rule that only exists in a nested file is
  invisible to them.
- **qwen reads `AGENTS.md` but not the skills it names.** So it knows a skill
  exists and nothing about its content. Any guarantee phrased as "every host
  gets this" must be a sentence in the root file, not a skill reference.
  A reviewer disproved an "all six hosts get this" claim on exactly this basis:
  the rule reached two.

## 2. A fourth hook dialect, and the failure mode it shares with the others

The model says hook dialects are not interchangeable and the envelope must be
the host's own. Reasonix confirms it and adds a sharper point: **the envelope
mismatch does not fail loudly, it fails silently and permissively.**

Reasonix keeps project hooks in `.reasonix/settings.json` in a flat shape
(`match`, `command`, `description`, `timeout`), not the nested Claude shape.
Its payload is:

```json
{
  "event": "PreToolUse",
  "cwd": "…",
  "toolName": "write_file",
  "toolArgs": { "path": "archive/note.md", "content": "ok" }
}
```

Three things differ from Claude's, and each one was wrong at some point during
wiring:

1. the tool name — `write_file`, not `Write` (and not `write`, the first guess);
2. the argument key — `path`, not `file_path`;
3. the path form — repo-relative, where Claude passes absolute.

None of the three raised anything. The policy script found no field it
recognised, exited 0, and every call was allowed, while `reasonix hook list`
reported the hook as `active` throughout. The third was the worst: a protected
write completed while the hook ran, matched nothing, and reported success —
because patterns anchored on a leading separator (`[\\/]archive[\\/]`) match an
absolute path and miss a relative one.

The resolution avoided a second copy of the policy: an adapter
(`.reasonix/hooks/claude-policy-adapter.mjs`) translates the envelope and
delegates to the same `.claude/hooks/` scripts, so the rules cannot drift apart.
`tools/reasonix-policy-adapter.test.ts` pins all three translations and was
observed failing with the path resolution removed.

**Candidate doctrine for the pack:** the model currently says never copy a
`hooks.json` across hosts. That is right but incomplete. Add: translate the
envelope and keep one policy owner; and after wiring a hook into any host, make
it block something and watch the block happen. A host reporting a hook as
active is not evidence that it fires. This is the general form of the rule the
pack already carries — _name a check by what its source proves_ — applied to
mechanisms rather than to facts.

## 3. The pack has no delegation doctrine

`scheme-port` ports a rule bundle into Claude-native config. `cross-host-model`
describes how one doctrine reaches several hosts. Both answer _which file does
this host read_. Neither answers _this host should do the work — how do I brief
it and how do I check what comes back_, which is now a daily activity and has
its own failure modes: underspecified briefs, confident wrong reports, false
negatives no report can disclose, and reach claims accepted without a grep.

This repository now carries that as a project skill, `delegate-to-cli`, with a
`references/hosts.md` holding invocation syntax and the traps. It is deliberately
in the project layer, not proposed for the pack: by the pack's own portability
test it would need to hold word-for-word in a second client project, and the
model names, budgets, and installed binaries are this machine's. What might be
pack-worthy after a second project uses it is the _shape_ — scout, applier,
adjudicator; brief carries its own constraints; verify substance and probe for
what was missed. Rule of two: leave it here until a second consumer exists.

## 4. A smaller correction, generally useful

Checking for a host binary from the wrong shell produces a false negative.
The Cursor CLI (`agent`, alias `cursor-agent`) ships as a PowerShell script
under `%LOCALAPPDATA%\cursor-agent`. It is on PowerShell's path and not on Git
Bash's, so `command -v agent` from Bash reports it missing on a machine where
it is installed and working. Probe for a host with the shell that host lives in,
and treat a negative from the wrong shell as no evidence at all.
