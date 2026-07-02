# Website Import And Rebuild Preview Architecture

Status: Accepted MVP direction

This document defines the MVP-safe shape for importing a customer's existing website and rebuilding it as a controlled preview. It complements [Frontend UI And Page Registry Architecture](frontend-ui-and-page-registry.md) and [Page Studio Layout-Zone Editor](page-studio-layout-zone-editor.md).

## Product Framing

Use this language:

```text
Rebuild your existing site as a faster, cleaner SEO version.
Keep the brand recognizable, improve the structure, and prepare local growth opportunities.
```

Avoid this language:

```text
Clone any website.
```

The product imports the customer's own website, extracts evidence, maps it into controlled components, and creates a noindex preview. It does not copy competitors, generate arbitrary production code, or publish without approval.

Roadmap context: website import is the evidence foundation for the AI Opportunity Scout. It supplies route, brand, service, area, content, and design facts to later agent workflows; it is not meant to replace AI-assisted SERP/competitor research or page proposal reasoning.

## MVP Flow

```text
customer enters own website URL
-> API validates project access and source URL
-> website-import job is queued
-> worker crawls bounded same-origin public pages
-> worker extracts content, metadata, assets, links, schema, screenshots, and design cues
-> facts and artifacts are persisted
-> AI Opportunity Scout and page proposal workflows use the evidence
-> rebuild preview is generated from the controlled page registry
-> customer/operator reviews preview and notes
-> approved page version enters release preflight
-> deploy/verify uses the existing release spine
```

## Architecture Boundaries

```text
Frontend
  submit import request
  show import status, evidence, preview, notes, approval

API
  authorize project access
  validate source URL
  create job/audit state
  enqueue website-import

Website Import Worker
  owns crawling and extraction orchestration
  calls CrawlerPort
  writes import evidence and object-storage artifacts
  creates preview/page proposal records

CrawlerPort
  provider-neutral read-only page extraction
  HTTP-first baseline, browser rendering only when needed

AiReasoningPort / future WebsiteUnderstanding workflow
  classifies persisted evidence into structured facts and suggestions
  never crawls independently, deploys, approves, or mutates providers

Page Registry
  renders controlled customer-site components from validated props

Release Worker
  publishes approved versions only
```

Existing local shape already supports the direction:

```text
contracts:
  jobTypes includes website_import
  queueNames includes website-import
  WebsiteImportJobDataSchema
  WebsiteImportQueueResponseSchema

adapters:
  CrawlerPort
  HttpWebsiteCrawlerAdapter

db:
  main_websites
  website_import_runs
  opportunities
  page_proposals
  page_versions
  component_templates
  component_instances
  component_notes
  approvals
```

## Current Baseline

The first implementation slice is intentionally evidence-first:

```text
POST /projects/:id/import-website
  body: { sourceUrl }
  validates project access and http(s) URL
  creates/updates main_websites
  creates website_import_runs
  queues website-import with importRunId

website-import worker
  loads website_import_runs
  crawls bounded same-origin HTML pages
  extracts title, meta description, H1, canonical, robots, links, images, schema types, and visible text summary
  derives first brand, service, and area candidate facts from extracted evidence
  writes full extracted snapshot to object storage
  writes import-run status, artifact key, and compact summary to Postgres

project dashboard
  reads latest import run through the API
  polls while queued/running
  shows status, source URL, artifact key, discovered routes, and candidate facts
```

This baseline does not yet generate page proposals, screenshots, design-system facts, or AI-assisted rebuild output.
The derived facts are agent context and candidates for operator/customer review, not ranking proof or publishable page content.

## Import Evidence Model

The first implementation should prioritize structured evidence over pixel-perfect reconstruction.

```text
WebsiteImportRun
  projectId
  sourceUrl
  status
  startedAt
  completedAt
  artifactRootKey
  failureJson

WebsiteImportSnapshot
  sourceUrl
  crawledAt
  pages[]
  assets[]
  brandFacts
  serviceFacts[]
  areaFacts[]
  designFacts
  seoFindings[]
  rebuildRiskNotes[]
```

Page evidence:

```text
url
status
title
metaDescription
h1
headings
canonical
robots
internalLinks
images
schemaTypes
visibleTextSummary
screenshotKey?
domSnapshotKey?
```

Artifact rule:

```text
Postgres stores state, summaries, and object-storage keys.
Object storage stores screenshots, large snapshots, extracted assets, and raw crawl artifacts when needed.
```

## Crawl Safety

The crawler is read-only and bounded.

```text
same-origin only unless explicitly approved
bounded page count
bounded crawl depth
bounded request timeout
bounded asset size
no form submission
no login/session automation in MVP
no competitor-site import
no provider mutation
no production publishing
record skipped URLs with reasons
```

URL and redirect handling should follow the same security posture as release verification: parse URLs with structured URL APIs, reject unsafe targets, and avoid off-host crawl expansion unless a future explicit allowlist exists.

## Browser Extraction

Default to deterministic HTTP extraction first.

Use browser rendering for:

```text
screenshots
client-rendered navigation discovery
visible text snapshots when static HTML is insufficient
component/page visual inspection
tracking/runtime checks where relevant
```

Do not use browser tools for:

```text
login automation in MVP
form submission
checkout/contact actions
CMS mutation
provider mutation
uncontrolled clicking
```

Stagehand-style observe/act/extract patterns are useful later if Playwright snapshots become insufficient. They are not a first dependency.

## Rebuild Preview

The rebuild preview is a controlled interpretation of the existing site:

```text
import evidence
-> brand/service/area/design facts
-> page registry component choices
-> page JSON
-> noindex preview
-> customer notes
-> approved version
```

It may improve:

```text
mobile layout
CTA clarity
metadata
heading structure
schema readiness
image alt text
internal links
sitemap readiness
performance-oriented static output
```

It must not:

```text
silently change approved versions
publish preview pages as indexable
copy competitor content
generate arbitrary deployable code strings
claim ranking success from weak evidence
```

## Potential Subpages And Subdomains

Website import should feed the AI Opportunity Scout.

Inputs:

```text
imported services
imported locations / service area
existing route inventory
detected gaps
SERP and competitor observations
GSC opportunity signals
tracking behavior
operator SERP notes
```

Outputs:

```text
service-location opportunity
nearby-place recommendation
page brief
page proposal
monitor / reject / hold action
```

Potential subpages and subdomains are proposals. They are not automatically published.

## Model And API Key Boundary

Model/search-provider keys, including any Opencode/OpenAI/Gemini-style key, must live in local environment files or deployment secrets. They must not be committed, stored in docs, exposed to the browser, or included in job evidence.

Model-backed reasoning is optional for the first crawler. When introduced, it should use a port:

```text
AiReasoningPort
  input: persisted WebsiteImportSnapshot or evidence references
  output: structured facts, risks, and proposal suggestions
```

The output must cross Zod contracts before it can become page facts, opportunities, page proposals, or preview content.

## MVP Implementation Slices

1. **Import request and job audit**
   Project-scoped API endpoint, source URL validation, `website-import` queue job, visible job state.

2. **Crawler baseline**
   Same-origin HTTP crawl, bounded depth/page count, extraction of page metadata, headings, links, schema types, images, and skipped URL reasons.

3. **Evidence persistence**
   Store import run status, summary facts, and object-storage artifact keys.

4. **Website preview facts**
   Derive brand, service, area, and design facts. Keep uncertain facts marked as uncertain.

5. **Controlled rebuild preview**
   Map facts into the first page-registry components and render noindex preview.

6. **Potential subpage proposals**
   Use imported services/areas plus GSC/tracking evidence to propose service-location briefs.

7. **Approval and release handoff**
   Approved preview versions enter existing release preflight, deploy, and verification.

## Deferred

```text
pixel-perfect reconstruction
full browser-agent import
Stagehand/Browserbase dependency
login-gated site import
CMS mutation
visual screenshot annotation with canvas
large-scale asset migration
automatic opportunity publishing
```

## Non-Negotiables

- Import only the customer's own site or explicitly authorized sources.
- Keep crawling read-only.
- Store evidence before generating preview output.
- Keep model reasoning behind a port and schema validation.
- Build previews from controlled page-registry components.
- Preserve preview/noindex until approval and release.
- Deploy only approved page versions through the existing release spine.
- Treat potential subpages as proposals until preview, approval, preflight, deploy, and verification complete.
