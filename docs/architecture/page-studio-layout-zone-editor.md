# Page Studio Layout-Zone Editor

Status: Accepted MVP direction

This document defines the Page Studio surface for generated customer pages and subpages. Page Studio is the "WordPress but easier" part of the product, but it is not a freeform website builder. It is a constrained editor over page templates, section types, variants, content props, media props, and local SEO rules.

Related docs:

- [Agent-First MVP Roadmap](agent-first-mvp-roadmap.md)
- [Frontend UI And Page Registry Architecture](frontend-ui-and-page-registry.md)
- [Website Import And Rebuild Preview Architecture](website-import-rebuild-preview.md)

## Product Decision

```text
Page Studio is a constrained layout-zone editor.
It is not a free drag-and-drop builder.
```

The customer/operator can choose component variants, ask the AI to generate or revise text, edit structured props, select media, write notes, and approve concrete page versions. Reordering is allowed only where the page registry says the movement is legal.

## Roadmap Placement

Page Studio spans three MVP roadmap slices:

```text
Slice 6: Page Proposal Workflow
  AI proposes page template, sections, copy, metadata, and SEO rationale.

Slice 7: Page Registry And Preview
  Registry defines section types, variants, prop schemas, preview renderers,
  allowed zones, and movement rules.

Slice 8: Page Studio, Notes, Approval, And Versioning
  UI exposes legal variant switching, legal section movement, text generation,
  editing, notes, approval, and version freezing.
```

## Page Structure

```text
Frame
  Header / nav       locked top
  Footer             locked bottom

Hero zone
  Hero               required, locked first after header

Body zones
  body_intro         intro/problem/service framing
  body_main          benefits, details, grids, media, galleries
  proof_media        reviews, references, before-after, proof sections
  body_late          FAQ, area map, nearby places, service-area details

CTA zone
  Final CTA          required or strongly recommended, locked late
```

The exact zones are product-level layout rules. The UI should not show movement controls that would create an invalid template.

## Section Types

Initial section type set:

```text
Header
Hero
ServiceIntro
ProblemSolution
ServiceDescription
BenefitsGrid
BulletList
ServiceGrid
ImageText
Gallery
Slideshow
Carousel
BeforeAfter
TrustReviews
References
FAQ
AreaMap
NearbyPlaces
ServiceAreaList
InlineCTA
FinalCTA
Footer
```

The MVP registry can implement a smaller subset first, but the rules should support this taxonomy so the system does not confuse "variant" with "section type."

## Movement Rules

Each section type owns movement rules:

```text
Header
  zone: frame_top
  canMove: false
  canDelete: false
  canChangeVariant: true

Hero
  zone: hero
  canMove: false
  canDelete: false
  canChangeVariant: true

ServiceIntro
  zone: body_intro
  canMove: true
  allowedMoveZones: [body_intro, body_main]

BenefitsGrid
  zone: body_main
  canMove: true
  allowedMoveZones: [body_main, proof_media]

Gallery / Slideshow / Carousel / ImageText
  zone: body_main
  canMove: true
  allowedMoveZones: [body_main, proof_media]

FAQ
  zone: body_late
  canMove: true
  allowedMoveZones: [body_late]

AreaMap / NearbyPlaces / ServiceAreaList
  zone: body_late
  canMove: true
  allowedMoveZones: [body_late]

FinalCTA
  zone: cta_late
  canMove: false for MVP
  canDelete: false
  canChangeVariant: true

Footer
  zone: frame_bottom
  canMove: false
  canDelete: false
  canChangeVariant: true
```

Movement controls are conditional:

```text
Show up arrow only if moving up is legal.
Show down arrow only if moving down is legal.
Disable or hide illegal movement actions.
Do not allow header, hero, final CTA, or footer to drift into random body positions.
```

## Page Studio UI

Example outline:

```text
[Header]               Locked top     < Variant 1 / 3 >
[Hero]                 Locked first   < Variant 2 / 5 >   Generate Text   Edit
[Service Intro]        Up/Down        < Variant 1 / 4 >   Generate Text   Edit
[Benefits Grid]        Up/Down        < Variant 2 / 6 >   Generate Text   Edit
[Image/Text]           Up/Down        < Variant 3 / 5 >   Media/Text      Edit
[Gallery]              Up/Down        < Variant 1 / 4 >   Media           Edit
[Trust Reviews]        Up/Down        < Variant 1 / 3 >   Select Proof    Edit
[FAQ]                  Legal Up only  < Variant 2 / 4 >   Generate FAQ    Edit
[Area Map]             Up/Down        < Variant 2 / 3 >   Edit Area       Edit
[Final CTA]            Locked late    < Variant 1 / 4 >   Generate CTA    Edit
[Footer]               Locked bottom  < Variant 1 / 2 >
```

Controls:

```text
left/right arrows
  Switch variants for the same section type.

up/down arrows
  Move a section only inside legal zones.

Generate Text
  Ask the AI to draft or revise copy inside the section schema.

Edit
  Manual structured prop editor.

Media
  Select, upload, or request image/media changes where the section allows it.

Replace Section
  Swap section type only when the target type is legal for the current zone.
```

## LLM Boundary

The LLM may suggest a page template or section changes, but it must output structured JSON that validates against the same registry rules as the UI.

```text
PageTemplateProposal
  pageType
  target
  templateId
  sections[]
  metadata
  schema
  internalLinks
  proofSources
  uniquenessRationale

PageSectionInstance
  id
  type
  zone
  variant
  order
  props
  sourceEvidenceIds
  generationReason
```

The model-specific choice belongs behind `AiReasoningPort`. The Page Studio contract must not depend on one model name. A strong frontend/content model can suggest sections and copy, but the product only accepts validated page JSON.

## Source Of Truth Placement

Recommended future ownership:

```text
packages/contracts
  PageTemplateProposal schema
  PageSectionInstance schema
  section type, zone, and action enums

packages/domain/src/page-studio
  pure movement and validation decisions:
    canMoveSection
    moveSection
    canReplaceSectionType
    canSwitchVariant
    validateTemplateStructure

packages/page-registry
  component prop schemas
  variants
  allowed tokens
  preview renderers
  registry metadata

apps/web/src/features/page-studio
  outline UI
  variant arrows
  legal movement controls
  section editor panels
  notes and approval

packages/ai
  page proposal and section-generation workflows that emit validated proposal schemas
```

This keeps layout rules reusable by the LLM boundary, API validation, preview UI, and release preflight.

## Versioning And Approval

```text
AI proposal creates a page proposal.
Page Studio edits create a preview version.
Customer/operator notes create explicit instructions.
Approval freezes one concrete page version.
New AI or manual changes create a new version.
Deploy publishes only approved versions.
```

## Non-Negotiables

- Do not generate arbitrary deployable HTML, React, or CSS strings.
- Do not expose illegal movement controls in the UI.
- Do not let the LLM bypass movement rules.
- Do not silently mutate approved versions.
- Do not copy competitor content.
- Do not publish preview pages as indexable.
- Do not claim ranking success from weak opportunity evidence.
