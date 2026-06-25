# 0000 - Decision Title

Date: YYYY-MM-DD
Status: Proposed

## Context

What problem, review finding, product requirement, or implementation pressure triggered this decision?

## Decision

What are we choosing?

Keep this section concrete enough that a future coding agent or developer can apply it without re-deciding the same issue.

## Consequences

What becomes easier?

What trade-offs or costs do we accept?

What follow-up work is required?

## Alternatives Considered

List serious options that were rejected and why.

## Regression Guard

What should future work avoid reintroducing?

Examples:

- no fake queued job responses unless explicitly marked `dry_run`
- no provider SDKs constructed inside domain logic
- no customer-facing report metrics that product rules ban

## Related Files

- `path/to/file.ts`
- `.ai-stack-rules/example.md`
- `docs/architecture/app-blueprint.md`
