---
name: delegate-to-cli
description: Move bulk work onto a cheaper CLI agent (Codex, Reasonix, qwen, agy, Cursor) and adjudicate what comes back. Use when a task is wide but shallow — repository sweeps, candidate hunts, mechanical refactors, doc fixes, applying a spec that is already written. Not for the judgment itself: deciding, gating, committing, and anything where being wrong is expensive stay here.
---

# Delegating work to another CLI agent

**This is not the same thing as porting the rules to another host.** Making
Codex or Cursor follow this repository's doctrine is a configuration question,
owned upstream by the pack master's `docs/cross-host-model.md` and, for this
repository, by `docs/agents/rule-system-maintenance.md`. That layer answers
"which file does this host read". This skill answers a different question:
having decided another agent should do the work, how do you brief it and how do
you check what it hands back. Read the other one when a host is following the
wrong rules; read this one when you are about to give a host a job.

The division is not "hard tasks here, easy tasks there". It is **who is
accountable for the answer**. A cheap model can read a hundred files; it cannot
be trusted to tell you what it missed. So it produces material and this session
produces the verdict.

```txt
scout finds  ->  applier changes  ->  this session verifies, gates, commits
```

Skipping the last step is the failure mode this skill exists to prevent. A
report that was never checked against the files is not a finding, it is a
claim — and cheap models produce confident wrong claims, including citations to
code that does not exist.

## When to delegate

Delegate when the work is **wide but shallow**: many files, one pattern,
a checkable result.

- Repository sweeps and candidate hunts ("every place that does X")
- Mechanical refactors with a written spec
- Doc fixes, renames, import cleanups
- Applying a spec someone else already reasoned out
- A second independent pass over ground already covered here

Keep it here when the work is **narrow but deep**, or when being wrong is
expensive:

- Deciding what the change should be
- Anything touching auth, tenancy, money, migrations, or deploy admission
- Reading a review and deciding which findings are real
- Writing the commit, running the gates, and reporting the outcome
- Any claim about system state that will be written down as fact

A useful check before delegating: *can I verify the result cheaply?* If
verifying costs as much as doing it, delegating buys nothing.

## Choosing the host

Read `references/hosts.md` for invocation syntax, model names, and the traps
that have already cost real money. The short version:

| Need | Host |
| --- | --- |
| Cheap read-only scan, low stakes | Reasonix `deepseek-flash` |
| Broad multi-angle sweep of the whole repository | Reasonix `deepseek-pro` |
| One tight, bounded scouting question | qwen `qwen3.8-max` (metered — see the traps) |
| Applying a written spec | agy, Cursor CLI, or Reasonix `deepseek-flash` |
| Adversarial review of a diff | Codex |

Do not send a broad open-ended hunt to a metered model. That has been done and
it burned twenty-four minutes of budget before being stopped.

## Writing the brief

The brief is the whole job. Everything a cheap host gets wrong that is not its
own fault traces back to a brief that assumed context the host does not have.

**A delegated host does not read the rules you read.** Each one loads a
different subset of this repository's layers, and none of them loads all of it.
Never assume the constraint is already in the host's context — if a rule
matters for the task, write the rule into the brief itself. `references/hosts.md`
records who reads what, and that table is verified rather than assumed.

A brief that works:

1. **The goal in one sentence**, in terms of the outcome, not the steps.
2. **The constraints inline** — the rules that apply, spelled out, not cited.
3. **Where to look and where not to**, with real paths.
4. **What the answer should look like** — a list, a diff, a file at a named
   path. Ambiguity here comes back as prose you then have to parse.
5. **Absolute paths for anything the host will create.** At least one host
   resolves relative paths against its own scratch directory, so a file you
   asked for lands somewhere you will never look.
6. **What is out of scope**, explicitly. Cheap models expand scope when idle.

For a longer worker brief, `triage/AGENT-BRIEF.md` already has the format this
repository uses for issue-driven agents; the same discipline applies here.

## Adjudicating what comes back

This is the part that cannot be delegated, and it is not a formality.

- **Verify the substance against real files.** Open what the report cites.
  A citation is not evidence that the code exists.
- **Probe for what it missed.** False negatives are the failure mode of a weak
  model, and a report cannot tell you about them. Run your own narrow check
  over the same ground, or have a second host cross-check.
- **Never accept a reach claim without a grep.** "This applies everywhere" and
  "all hosts see this" are the two claims most often wrong, and both are cheap
  to check.
- **Run the gates yourself.** `corepack pnpm lint`, `typecheck`, the narrow
  tests, and `corepack pnpm exec tsx tools/check-architecture-regression-guards.ts`
  before committing. A host reporting success is not a gate.
- **Match the proof to the change.** A green typecheck is not a behavioral
  test. If the fitting proof cannot run, name it and say why — a cheaper green
  check never stands in for it.

When the result is wrong, prefer rewriting the brief over arguing with the
host. Most bad output is an underspecified brief wearing a disguise.

## Two rules that keep being relearned

**A mechanism that is installed is not a mechanism that runs.** Wiring a hook,
a guard, or a check into another host and seeing it reported as active proves
nothing about whether it fires. Probe it: make it block something, and watch
the block happen. Three separate translation layers between this repository's
policy and Reasonix were wrong at some point, and not one of them raised
anything — each silently allowed everything while reporting itself active.

**Never kill a metered print-mode run.** Print mode emits output only at the
end, so killing it loses every token already spent. Salvage instead: find the
session and resume it asking for the report from work already done, with no new
searches. The analysis is paid for and recoverable.
