# Hosts: invocation, reach, and traps

Two things drift here and both are load-bearing: the flags a host needs to do
real work, and which layers of this repository it actually reads. Re-probe
before trusting an entry — every line below was wrong at some point.

Presence of each binary was checked on the maintainer's machine on 2026-08-28.
A fresh clone on another machine proves nothing about it.

## Invocation

| Host | Read-only | Writing | Notes |
| --- | --- | --- | --- |
| Reasonix | `reasonix -p "…"` | `reasonix run --permission-mode bypassPermissions --model <m> "…"` | Models `deepseek-flash` (cheap default) and `deepseek-pro` (broad sweeps). |
| qwen | `qwen -m <model> -p "…"` | — | `ox-alpha-free` for low-stakes scans, `qwen3.8-max` for scouting (metered). |
| Codex | `codex exec -m <model> "…"` | `codex exec -s workspace-write "…"` | Strongest as an adversarial reviewer of a diff. |
| agy | `agy --print-timeout 20m "…"` | `agy --dangerously-skip-permissions --print-timeout 20m "…"` | Absolute paths only — see the traps. |
| Cursor CLI | `agent --plan -p "…"` | `agent -p --force --model <m> "…"` | Invoke from PowerShell — see below. `-p` already carries write and shell access; `--force` allows commands unless explicitly denied. |

The Cursor CLI ships as a PowerShell script (`agent.ps1`, with `agent.cmd`
beside it) under the user's local application data, and `cursor-agent` is the
same entry point. It is on PowerShell's path and **not** on Git Bash's, so a
`command -v agent` from a Bash shell reports it missing on a machine where it
is installed and working. Check for a host with the shell that host lives in
before recording it as absent. Useful extras: `--mode plan` or `--plan` for a
read-only pass, `--output-format json` for a parseable result, and `--resume` /
`--continue` to pick a session back up.

Reasonix permission modes, from its own help: `manual`, `ask`, `auto`,
`acceptEdits`, `dontAsk`, `plan`, `bypassPermissions`. The default is `ask`,
and headless that means **every edit is silently denied** — a write job without
`--permission-mode` produces a confident report and no files. `write_roots`
still confines writes to the repository, so the flag is not a blanket grant.

## What each host actually reads

Never assert this from the shape of a config directory. It has been wrong
before: a claim that "all six hosts get this rule" turned out to reach two.

| Host | Reads |
| --- | --- |
| Claude Code | `CLAUDE.md` (which imports `AGENTS.md`), `.claude/` |
| Codex | root and nested `AGENTS.md`, `.agents/skills/`, `.codex/` |
| Cursor, editor and CLI | root and nested `AGENTS.md`, `.agents/skills/`, `.cursor/` including `.cursor/rules/*.mdc` — the CLI reads the same rule files as the editor |
| agy | root `AGENTS.md`/`GEMINI.md`, `.agents/skills/`, `.agents/rules/` |
| qwen | `AGENTS.md` only |
| Reasonix | root `AGENTS.md` tree, `.reasonix/` |

Consequences worth holding onto:

- Claude Code does **not** auto-load `AGENTS.md`. It reaches this repository's
  routing layer only through the `@AGENTS.md` import at the top of `CLAUDE.md`,
  which is guard-anchored for that reason.
- Nested `AGENTS.md` files are unreliable for agy and qwen. If a nested rule
  matters for a delegated task, put it in the brief.
- qwen sees the shared skills only when the user-level `~/.qwen/settings.json`
  sets `skills.directories` to this repository's `.agents/skills` path. That is
  per-machine, and no repository check can verify it.
- `AGENTS.md` names the skills but does not carry their content, so a host that
  reads only `AGENTS.md` knows a skill exists and nothing about what it says.

## Traps

Each of these cost real time or real money.

**Never kill a metered print-mode run.** Print mode emits output only at the
end. Killing it loses every token already spent. Salvage instead:

```bash
qwen sessions list
```

then resume that session asking for the report from work already done, with no
new searches. The paid analysis is recoverable; a kill throws it away.

**Give agy absolute paths for anything it creates.** It resolves relative paths
against its own scratch directory, not the workspace, so a file you asked for
lands where you will never look.

**Give agy `--print-timeout 20m` on code jobs.** Print mode defaults to a
five-minute wait that kills the run mid-wait: it has finished its edits, hung
waiting on its own background lint, and timed out without ever writing the
report. Also tell it to run checks in the foreground and write the report
before any long-running check.

**Send broad hunts to `deepseek-pro`, not to a metered model.** A six-angle
sweep on `qwen3.8-max` ground for twenty-four minutes before being stopped over
budget. A full-repository sweep on `deepseek-pro` cost about one cent. Give
metered models tight, bounded questions only.

**Treat free-tier findings as leads.** `ox-alpha-free` is a weak model; its
searches can be wrong or incomplete. Act on its output only where an
independent net exists — an integration suite, your own grep sweep, or a second
model's cross-check.

## Hooks

Each host has its own hook wiring, and the payload shapes differ. The policy
scripts live once in `.claude/hooks/`; other hosts reach them through adapters
rather than copies, so the rules cannot drift apart. `docs/agents/rule-system-maintenance.md`
carries the details, including the Reasonix payload shape and the three
translation layers that each silently allowed everything while reporting
themselves active.

The lesson generalises: after wiring a hook into any host, make it block
something and watch the block happen. A host reporting a hook as active is not
evidence that it fires.
