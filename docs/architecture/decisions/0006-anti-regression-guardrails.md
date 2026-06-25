# 0006 - Anti-Regression Guardrails

Date: 2026-06-25
Status: Accepted

## Context

Several review cycles found repeated classes of mistakes:

- flattened or suspicious raw text files
- queue endpoints returning successful-looking jobs without a real queue
- accepting `rediss://` without TLS behavior
- readiness checks that only inspected configuration
- route params or user-supplied headers being mistaken for production authorization
- behavior described in ADRs but not enforced by tests or CI

These are not one-off lessons. They should become guardrails so the same issue is not rediscovered by every future review.

## Decision

Use three layers for anti-regression knowledge:

```text
Executable guardrail:
  CI, tests, lint rules, format checks, smoke checks, and small validation scripts

AI guardrail:
  hidden `.ai-*-rules/` files that route future implementation through the correct source and constraint

Human guardrail:
  ADRs and progress notes explaining why the guard exists and what trade-off it protects
```

When a review finds a repeated or high-risk issue, prefer adding an executable guard first. If an executable guard is not practical yet, record the limitation in an ADR and route it through the relevant hidden rule file.

## Current Executable Guards

The CI workflow runs:

```text
format:check
text:check
git diff --check
lint
typecheck
build
test
```

`text:check` exists specifically to catch flattened-file and CR-only text regressions for critical files such as:

- `.env.example`
- `.prettierignore`
- `.gitattributes`
- `AGENTS.md`
- `.github/workflows/ci.yml`
- key TypeScript source files
- progress documentation

This complements Prettier. Prettier handles formatting; `text:check` confirms that known high-value text files remain line-based and readable in raw GitHub, scripts, diffs, and AI ingestion.

## Consequences

What becomes easier:

- Review findings become durable checks.
- Future agents and developers see where a decision lives.
- CI catches formatting and text-shape regressions before `main` is trusted.

Costs:

- Some guards are intentionally conservative.
- The curated `text:check` file list must be updated if critical files move.
- Frozen copied reference bundles are not normalized retroactively; guards should focus on current project-owned files.

## Alternatives Considered

### Only Document The Lesson

Rejected. Documentation helps humans, but it does not fail a pull request.

### Run `git diff-tree --check --root -r HEAD`

Rejected for this repo. It also checks frozen copied reference bundles that intentionally preserve upstream whitespace. The current guard checks new working-tree whitespace plus curated critical text health.

### Normalize Every Copied Reference File

Rejected. Frozen reference bundles are meant to remain copied source material. Project-owned files should be normalized and guarded instead.

## Regression Guard

- Do not remove `text:check` from CI without replacing it with an equivalent check.
- Do not let a review finding remain only in chat if it represents a repeated or production-risk issue.
- Do not edit frozen reference bundles just to satisfy a broad whitespace guard.
- Do not add a new critical project-owned root/config file without considering whether it belongs in `tools/check-text-health.mjs`.

## Related Files

- `tools/check-text-health.ts`
- `.github/workflows/ci.yml`
- `package.json`
- `.gitattributes`
- `docs/progress/README.md`
- `docs/architecture/decisions/0002-nest-backend-production-hardening.md`
