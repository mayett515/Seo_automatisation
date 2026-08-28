# Lane map (generated)

Do not edit. Regenerate with `corepack pnpm exec tsx tools/check-lane-inventory.ts --write`.
This file answers "what exists and in what state". It is a review starting
point, not unquestionable truth: the reason and proof for each state live in
the leaf next to the handler named in the first column.

## evidence

| Lane | State | Missing | Proof |
| --- | --- | --- | --- |
| `analytics` | scaffold | 2 | - |
| `gsc-sync` | built | - | apps/worker/src/handlers/gsc-sync.integration.ts |
| `serp-scout` | partial | 1 | apps/worker/src/handlers/serp-scout.integration.ts |
| `technical-audit` | built | - | apps/worker/src/handlers/technical-audit.integration.ts |

## intake

| Lane | State | Missing | Proof |
| --- | --- | --- | --- |
| `pre-audit` | scaffold | 4 | - |

## notification

| Lane | State | Missing | Proof |
| --- | --- | --- | --- |
| `notifications` | scaffold | 2 | - |

## opportunity

| Lane | State | Missing | Proof |
| --- | --- | --- | --- |
| `local-analysis` | scaffold | 2 | - |
| `opportunity-research` | built | - | apps/worker/src/opportunity-research-scheduler.integration.ts |
| `opportunity-scout` | built | - | apps/worker/src/handlers/opportunity-scout.integration.ts |

## page

| Lane | State | Missing | Proof |
| --- | --- | --- | --- |
| `media-processing` | built | - | apps/worker/src/handlers/media-processing.integration.ts |
| `page-generation` | built | - | apps/worker/src/handlers/page-proposal.integration.ts |
| `seo-qa` | scaffold | 2 | - |

## release

| Lane | State | Missing | Proof |
| --- | --- | --- | --- |
| `deploy` | built | - | apps/worker/src/handlers/deploy.integration.ts |
| `release-verification` | built | - | apps/worker/src/handlers/release-verification.integration.ts |
| `rollback` | built | - | apps/worker/src/handlers/rollback.integration.ts |

## report

| Lane | State | Missing | Proof |
| --- | --- | --- | --- |
| `report` | partial | 1 | apps/worker/src/handlers/customer-report.integration.ts |

## website

| Lane | State | Missing | Proof |
| --- | --- | --- | --- |
| `website-import` | built | - | apps/worker/src/handlers.test.ts |
