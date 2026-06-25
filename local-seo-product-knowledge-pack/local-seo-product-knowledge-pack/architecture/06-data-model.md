---
title: "Data Model"
version: "1.0.0"
layer: "data"
---

# Data Model

## Core ERD

```mermaid
erDiagram
  LEAD ||--o{ PRE_AUDIT : starts
  LEAD ||--o{ QUESTION_ANSWER : answers
  LEAD ||--o{ POTENTIAL_REPORT : receives
  LEAD ||--o| CUSTOMER : converts_to

  CUSTOMER ||--o{ PROJECT : owns
  PROJECT ||--|| MAIN_WEBSITE : has
  PROJECT ||--o{ DOMAIN : uses
  PROJECT ||--o{ SUBDOMAIN : creates
  PROJECT ||--o{ AREA : targets
  PROJECT ||--o{ SERVICE : offers
  PROJECT ||--o{ COMPETITOR : tracks
  PROJECT ||--o{ OPPORTUNITY : discovers
  PROJECT ||--o{ PAGE_PROPOSAL : has
  PROJECT ||--o{ DEPLOYMENT : deploys
  PROJECT ||--o{ REPORT : produces
  PROJECT ||--o{ BUNDLE : groups

  PAGE_PROPOSAL ||--o{ PAGE_VERSION : has
  PAGE_VERSION ||--o{ COMPONENT_INSTANCE : contains
  COMPONENT_INSTANCE ||--o{ COMPONENT_NOTE : has
  PAGE_VERSION ||--o{ APPROVAL : requires

  GENERATED_PAGE ||--o{ PERFORMANCE_SNAPSHOT : measured_by
  GENERATED_PAGE ||--o{ TRACKING_EVENT : receives
  BUNDLE ||--o{ BUNDLE_ITEM : contains
  REPORT ||--o{ SEO_OBSERVATION : includes
```

## Key Tables

```text
leads
pre_audits
potential_reports
customers
projects
main_websites
domains
subdomains
areas
services
competitors
opportunities
page_proposals
page_versions
component_templates
component_instances
component_notes
approvals
deployments
gsc_connections
performance_snapshots
tracking_events
seo_observations
bundles
bundle_items
experiments
experiment_results
reports
```

## Bundle Items

```text
bundle_items:
- keyword
- city
- service
- page_id
- current_position
- target_position
- impressions
- clicks
- ctr
- opportunity_score
- estimated_value
```
