# Lane map (generated)

Do not edit. Regenerate with `corepack pnpm exec tsx tools/check-lane-inventory.ts --write`.
This file answers "what exists and in what state"; the reason for each state lives in the leaf.

## evidence

| Lane | State | Consumes | Produces | Missing |
| --- | --- | --- | --- | --- |
| `analytics` | scaffold | tracking-event | - | 2 |
| `gsc-sync` | built | gsc-connection, sync-window | gsc-search-analytics-rows, gsc-opportunity-signals | - |
| `serp-scout` | partial | serp-snapshot-request | serp-snapshot | 1 |
| `technical-audit` | built | project-website-url | technical-audit-findings | - |

## intake

| Lane | State | Consumes | Produces | Missing |
| --- | --- | --- | --- | --- |
| `pre-audit` | scaffold | lead | - | 6 |

## notification

| Lane | State | Consumes | Produces | Missing |
| --- | --- | --- | --- | --- |
| `notifications` | scaffold | - | - | 2 |

## opportunity

| Lane | State | Consumes | Produces | Missing |
| --- | --- | --- | --- | --- |
| `local-analysis` | scaffold | - | - | 2 |
| `opportunity-research` | built | opportunity-candidates | opportunity-research-findings | - |
| `opportunity-scout` | built | project-context, gsc-opportunity-signals | opportunity-candidates | - |

## page

| Lane | State | Consumes | Produces | Missing |
| --- | --- | --- | --- | --- |
| `media-processing` | built | media-upload-intent | media-asset-variants | - |
| `page-generation` | built | accepted-opportunity, page-template | page-version | - |
| `seo-qa` | scaffold | - | - | 2 |

## release

| Lane | State | Consumes | Produces | Missing |
| --- | --- | --- | --- | --- |
| `deploy` | built | approved-release-plan, static-site-artifact | deployment, release-verification-request | - |
| `release-verification` | built | release-verification-request | release-verification-evidence | - |
| `rollback` | built | rollback-point, rollback-request | rollback-outcome | - |

## report

| Lane | State | Consumes | Produces | Missing |
| --- | --- | --- | --- | --- |
| `report` | partial | gsc-search-analytics-rows, deployment, release-verification-evidence, page-version, opportunity-candidates | customer-report | 1 |

## website

| Lane | State | Consumes | Produces | Missing |
| --- | --- | --- | --- | --- |
| `website-import` | partial | project-website-url | website-import-snapshot | 1 |

## Flow

```mermaid
flowchart LR
  tracking_event --> analytics
  approved_release_plan --> deploy
  static_site_artifact --> deploy
  deploy --> deployment
  deploy --> release_verification_request
  gsc_connection --> gsc_sync
  sync_window --> gsc_sync
  gsc_sync --> gsc_search_analytics_rows
  gsc_sync --> gsc_opportunity_signals
  media_upload_intent --> media_processing
  media_processing --> media_asset_variants
  opportunity_candidates --> opportunity_research
  opportunity_research --> opportunity_research_findings
  project_context --> opportunity_scout
  gsc_opportunity_signals --> opportunity_scout
  opportunity_scout --> opportunity_candidates
  accepted_opportunity --> page_generation
  page_template --> page_generation
  page_generation --> page_version
  lead --> pre_audit
  release_verification_request --> release_verification
  release_verification --> release_verification_evidence
  gsc_search_analytics_rows --> report
  deployment --> report
  release_verification_evidence --> report
  page_version --> report
  opportunity_candidates --> report
  report --> customer_report
  rollback_point --> rollback
  rollback_request --> rollback
  rollback --> rollback_outcome
  serp_snapshot_request --> serp_scout
  serp_scout --> serp_snapshot
  project_website_url --> technical_audit
  technical_audit --> technical_audit_findings
  project_website_url --> website_import
  website_import --> website_import_snapshot
```
