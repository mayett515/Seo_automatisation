---
lane: notifications
domain: notification
state: scaffold
enforces: []
missing: ["worker handler", "no producer - nothing enqueues into this queue"]
consumes: []
produces: []
terminal: []
external: []
reason: "Worker W10 of the original topology (architecture/04-worker-architecture.md). Never built, and no decision records whether the product needs it: today the customer learns about a finished deploy or a waiting approval by looking, not by being told."
trigger: "A workflow where waiting for the customer to look is too slow - an approval that blocks a deploy, or a verification failure that needs attention."
proof: ""
---

## Is

Nothing. Declared, a worker is started for it, unreachable from any producer.

## Is not

- Not the reason approvals work. Approval state is durable and visible in the
  product; a notification would announce it, not hold it.
