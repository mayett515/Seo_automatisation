# 2026-08-25 - Connascence of Execution and branded primitives

Trigger: an article on Connascence of Execution and branded types
(dearlordylord.com, 2026-08-25) proposing that order-dependent APIs be made
unrepresentable through typestate, with Effect's branded types as the vehicle.
The question is what transfers to this repository.

## Verdict

Not promoted to a rule. The naming is valuable, the in-process half is already
covered by an existing rule, and the branded-id half has measured risk but no
incident. This file records the evidence so a future promotion does not have to
rediscover it.

## Where the smell is real here

The release lifecycle is order-dependent and enforces the order at runtime:

- `apps/api/src/modules/releases/release-aggregate-store.ts:224` throws
  `ConflictException` when a plan is not in a preflightable state.
- `apps/api/src/modules/releases/release-execution.capability.ts:52` throws
  `BadRequestException` when a deploy is attempted before preflight approval.

This is structurally the article's `file.close(); file.write()` case: a
sequence the code checks rather than a sequence the type prevents.

## Why the release lifecycle is not a typestate candidate

Approval and deploy are separate HTTP requests, minutes apart, with PostgreSQL
between them. What does not survive that gap is the earlier in-memory proof,
not the refined type as such: after any process, queue, or persistence
boundary, the state can be loaded, validated, and narrowed again. The rule that
follows is therefore narrower than "types cannot do this":

> A type proof established before a process, queue, or persistence boundary
> does not carry across it. Reload and revalidate the state, build a refined
> type from the reloaded value if it helps the code that follows, and guard
> competing transitions atomically in the database as well - a refined type
> proves what was read, never that no one else is writing.

The runtime checks at those two lines are the correct design, not a shortcut,
because they are also the concurrency guard. A typestate chain spanning the two
requests would add compile-time ceremony around a guarantee it cannot provide.

The idea transfers only within a single call path, where the earlier step can
return the type the later step requires. That case is already owned by the
"Guards that prove a resource" rule in `.claude/rules/boundaries.md` and its
local instance in `apps/api/AGENTS.md`; Connascence of Execution is the name
for why that rule works, not an additional rule.

## Branded ids: measured, not yet promoted

Counted on 2026-08-25 with the commands below, so the numbers are reproducible
and correctable:

```bash
# signatures where two id-typed string parameters sit next to each other
grep -rEoh "[a-zA-Z]*[Ii]d: string, *[a-zA-Z]*[Ii]d: string" packages apps --include=*.ts | wc -l   # 54
# files containing such a signature, excluding tests
grep -rEl "[a-zA-Z]*[Ii]d: string, *[a-zA-Z]*[Ii]d: string" packages apps --include=*.ts | grep -v "\.test\.\|\.integration\." | wc -l   # 27
# branded types defined anywhere in the repository
grep -rn "\.brand<\|__brand" packages apps --include=*.ts | wc -l   # 0
```

That is 54 adjacent id pairs across 27 non-test files, against zero branded
types. An earlier count of 118 in this file's first version was wrong: it
counted lines ending in `projectId: string,`, which includes multi-line
parameter lists whose next parameter is not an id at all. Swapping two ids in
any of the 54 compiles cleanly:

```ts
async deploy(projectId: string, releasePlanId: string, userId?: string)
```

Cost is lower than the article implies. Zod 4 provides `.brand<"ProjectId">()`
at the ingress parse this repository already performs, so no new library and
specifically no Effect adoption is required.

Not promoted, for two reasons. No id swap has produced a defect here, so the
rule would rest on plausibility rather than evidence. And 54 call sites is a
migration, not a rule line: writing the rule before the migration would leave
an always-on claim the code does not honor, which the documentation rules
forbid.

## Promotion trigger

Promote when an id swap causes a real defect, or when a migration of the id
types is scheduled as its own change. At that point this file supplies the
scope, the ingress mechanism, and the reason Effect is not needed.
