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
between them. A brand does not survive a database round trip, so the type
cannot carry the guarantee across the gap. The runtime check at those two lines
is the correct design, not a shortcut. Any refactor that turns the lifecycle
into a typestate chain would add compile-time ceremony around a guarantee it
cannot actually provide.

The idea transfers only within a single call path, where the earlier step can
return the type the later step requires. That case is already owned by the
"Guards that prove a resource" rule in `.claude/rules/boundaries.md` and its
local instance in `apps/api/AGENTS.md`; Connascence of Execution is the name
for why that rule works, not an additional rule.

## Branded ids: measured, not yet promoted

Counted on 2026-08-25: 118 function signatures under `packages/db/src` and
`apps/api/src` take adjacent `id: string` parameters, and the repository
defines zero branded types. Swapping two ids compiles cleanly:

```ts
async deploy(projectId: string, releasePlanId: string, userId?: string)
```

Cost is lower than the article implies. Zod 4 provides `.brand<"ProjectId">()`
at the ingress parse this repository already performs, so no new library and
specifically no Effect adoption is required.

Not promoted, for two reasons. No id swap has produced a defect here, so the
rule would rest on plausibility rather than evidence. And 118 call sites is a
migration, not a rule line: writing the rule before the migration would leave
an always-on claim the code does not honor, which the documentation rules
forbid.

## Promotion trigger

Promote when an id swap causes a real defect, or when a migration of the id
types is scheduled as its own change. At that point this file supplies the
scope, the ingress mechanism, and the reason Effect is not needed.
