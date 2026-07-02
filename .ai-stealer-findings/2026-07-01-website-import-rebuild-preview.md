# Finding: Website Import And Rebuild Preview

Date: 2026-07-01
Sources:

- `C:\big eater\repo-scout-findings-index-2026-07-01.md`
- `C:\big eater\stealer-findings-addendum-2026-07-01.md`
- `local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/product/04-main-website-rebuild.md`
- `local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/diagrams/04-website-rebuild-sequence.mmd`
- `local-seo-product-knowledge-pack/local-seo-product-knowledge-pack/architecture/04-worker-architecture.md`

License: No code copied. External sources are used for architecture and safety patterns only.

## What We Needed

The MVP should import a customer's existing website, understand it, and produce a controlled improved preview. The product should not present itself as an arbitrary website cloning engine.

Preferred product language:

```text
We rebuild your existing site as a faster, cleaner SEO version,
keep your brand recognizable, and prepare local growth opportunities.
```

Avoid:

```text
We clone your website.
```

## What The Sources Contributed

`C:\big eater` points to four useful source families:

```text
Mastra browser-agent / Playwright snapshot pattern
  read-only page extraction, snapshots, stable refs, browser evidence

Stagehand observe/act/extract pattern
  useful later for higher-level extraction, but more powerful/risky than needed first

AI website cloner examples
  cautionary workflow shape only; do not copy arbitrary sites or implementation

Local product pack
  own-site import, component mapping, noindex preview, customer notes, approval
```

## What We Steal

- Treat website import as read-only evidence gathering.
- Crawl the customer's own site first with bounded deterministic rules.
- Use browser rendering for snapshots and dynamic extraction only when static HTML is insufficient.
- Store extracted evidence and risk notes before producing a rebuild preview.
- Map the imported site into our controlled page component registry instead of generating arbitrary code.
- Use AI/model reasoning only to classify, summarize, and propose from persisted evidence.
- Keep preview/noindex and approval before any production deploy.

## Local Architecture Shape

```text
API
  accepts project-scoped import request
  validates ownership and source URL
  queues website-import job

Website Import Worker
  reloads project/main website context
  crawls same-origin public pages through CrawlerPort
  stores extracted evidence and artifacts
  derives brand/service/area/design facts
  creates noindex rebuild preview proposal

Page Registry
  maps facts into controlled component instances
  validates props and SEO requirements

Preview / Approval
  customer reviews concrete page version
  notes create new versions
  approval freezes the version

Release Spine
  existing preflight -> deploy -> verify path publishes approved versions only
```

Existing local hooks already point in this direction:

```text
jobTypes includes "website_import"
queueNames includes "website-import"
CrawlerPort exists in packages/adapters
main_websites, opportunities, page_proposals, page_versions, component_* tables exist
```

## MVP Import Evidence

The first import slice should produce structured evidence, not a complete site clone.

```text
WebsiteImportSnapshot
  sourceUrl
  crawledAt
  pages[]
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
  assets[]
    url
    kind
    contentType
    size
    altText?
  brandFacts
    businessName
    phone
    email?
    colors
    typography hints
    logo asset
    tone
  serviceFacts[]
  areaFacts[]
  designFacts
  seoFindings[]
  rebuildRiskNotes[]
```

Large raw artifacts, screenshots, and crawled page snapshots should live in object storage by key. Database rows should hold status, references, facts, and user-visible summaries.

## Crawl Safety Rules

```text
same-origin only unless explicitly approved
bounded page count and depth
bounded asset size
no form submission
no login/session automation in MVP
no competitor-site import
no production mutation from browser tools
respect URL normalization and redirect safety
record skipped pages with reasons
```

The first crawler can be HTTP-first. Browser rendering can be added for screenshots, client-rendered navigation, tracking/runtime checks, and dynamic content extraction when needed.

## Model / API Key Boundary

Model or search-provider keys must stay in environment or deployment secrets. They must not be committed, exposed to the browser, or stored in project docs.

If model-backed analysis is used, it belongs behind a purpose-named boundary:

```text
AiReasoningPort / WebsiteUnderstanding workflow
  input: persisted import evidence
  output: structured facts, risks, and proposal suggestions
```

The model does not crawl independently, publish, deploy, approve, or mutate provider state.

## Rebuild Preview

The preview should be a controlled reconstruction:

```text
import evidence
-> brand/service/area/design facts
-> page registry component choices
-> page JSON
-> noindex preview
-> notes and approval
```

It should not be:

```text
pixel-perfect arbitrary clone
raw generated React code
freeform page builder
competitor content copy
automatic production publish
```

## Potential Subpages

Website import should feed the Potential Searcher:

```text
imported services
imported service area / locations
existing route inventory
GSC sync signals
tracking behavior
manual/operator SERP notes
-> service-location opportunities
-> page briefs / proposals
```

Potential subpages and subdomains are proposals first. They require evidence, uniqueness/cannibalization checks, preview, approval, release preflight, deploy, and verification.

## Decision

Accepted as MVP direction. Website import/rebuild belongs before or alongside the first Opportunity Explorer because it supplies the brand, service, route, and design facts that make opportunities and previews useful.
