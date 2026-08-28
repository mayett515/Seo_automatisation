# Page domain

## What it is for

Local pages and subdomains are generated from the product's own templates and
components. The customer does not get a free website builder; they get a
controlled preview where they pick variants, write notes, and approve concrete
versions. Templates exist to improve UX and conversion, not to disguise that
pages resemble each other.

Lanes: `page-generation`, `media-processing`, `seo-qa`.

Product source: `product/05-template-component-preview-system.md`,
`product/07-subdomains-local-pages.md`.

## Invariants

### D1 - The customer approves a concrete version, and it never changes afterwards

After approval that version is not silently edited. This is enforced in the
database, not only in code.

### D2 - New changes produce new versions

Notes, regenerations, and edits create a new version rather than mutating the
approved one, so that what was approved stays inspectable.

### D3 - A page reaches the sitemap only when it is publish-ready

Draft and noindex pages never enter the sitemap, and canonicals never point at a
preview domain.

_Mechanised at:_ packages/contracts/src/pages.ts:PageJsonSchema -
`sitemapReady` defaults to false, so a page stays out of the sitemap until
something marks it ready.

### D4 - A generated page carries its own local substance

Own local content, own search intent, real proofs where they exist, sensible
internal links and a clear CTA. A page that only varies a place name fails the
quality gate.

_Mechanised at:_ packages/seo/src/index.ts:evaluateLocalPageQa is a
pure function applied where pages are produced, which is why the planned seo-qa
worker was never needed.
