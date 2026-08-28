# Lane map (generated)

Do not edit. Regenerate with `corepack pnpm exec tsx tools/check-lane-inventory.ts --write`.
This file answers "what exists and in what state". It is a review starting
point, not unquestionable truth: the reason and proof for each state live in
that lane's leaf, under apps/worker/src/handlers/. Handler registered and
admitted by API producer are read from the code; every other column is the
leaf's own claim about itself.

Admitted by API producer means the shared producer will enqueue into that
lane. It is not the same as unreachable from HTTP: a module that builds its
own queue bypasses that list, and `gsc-sync` does. See SCHEMA.md.

## evidence

| Lane | State | Handler registered | Admitted by API producer | Missing | Proof |
| --- | --- | --- | --- | --- | --- |
| `analytics` | scaffold | no | no | 2 | - |
| `gsc-sync` | built | yes | no | - | apps/worker/src/handlers/gsc-sync.integration.ts |
| `serp-scout` | partial | yes | yes | 1 | apps/worker/src/handlers/serp-scout.integration.ts |
| `technical-audit` | built | yes | yes | - | apps/worker/src/handlers/technical-audit.integration.ts |

## intake

| Lane | State | Handler registered | Admitted by API producer | Missing | Proof |
| --- | --- | --- | --- | --- | --- |
| `pre-audit` | scaffold | no | no | 4 | - |

## notification

| Lane | State | Handler registered | Admitted by API producer | Missing | Proof |
| --- | --- | --- | --- | --- | --- |
| `notifications` | scaffold | no | no | 2 | - |

## opportunity

| Lane | State | Handler registered | Admitted by API producer | Missing | Proof |
| --- | --- | --- | --- | --- | --- |
| `local-analysis` | scaffold | no | no | 2 | - |
| `opportunity-research` | built | yes | yes | - | apps/worker/src/opportunity-research-scheduler.integration.ts |
| `opportunity-scout` | built | yes | yes | - | apps/worker/src/handlers/opportunity-scout.integration.ts |

## page

| Lane | State | Handler registered | Admitted by API producer | Missing | Proof |
| --- | --- | --- | --- | --- | --- |
| `media-processing` | built | yes | yes | - | apps/worker/src/handlers/media-processing.integration.ts |
| `page-generation` | built | yes | yes | - | apps/worker/src/handlers/page-proposal.integration.ts |
| `seo-qa` | scaffold | no | no | 2 | - |

## release

| Lane | State | Handler registered | Admitted by API producer | Missing | Proof |
| --- | --- | --- | --- | --- | --- |
| `deploy` | built | yes | yes | - | apps/worker/src/handlers/deploy.integration.ts |
| `release-verification` | built | yes | yes | - | apps/worker/src/handlers/release-verification.integration.ts |
| `rollback` | built | yes | yes | - | apps/worker/src/handlers/rollback.integration.ts |

## report

| Lane | State | Handler registered | Admitted by API producer | Missing | Proof |
| --- | --- | --- | --- | --- | --- |
| `report` | partial | yes | yes | 1 | apps/worker/src/handlers/customer-report.integration.ts |

## website

| Lane | State | Handler registered | Admitted by API producer | Missing | Proof |
| --- | --- | --- | --- | --- | --- |
| `website-import` | built | yes | yes | - | apps/worker/src/handlers.test.ts |
