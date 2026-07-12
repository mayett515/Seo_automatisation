# 0020 - Project-Scoped Media Asset Pipeline

Date: 2026-07-12
Status: Accepted

## Context

Page Studio now supports append-only structured editing, controlled section replacement, and bounded AI copy revision. Media is the remaining Page Studio control that cannot be added safely as one more string prop.

The current architecture has three relevant constraints:

- `PageJson` is an approved structural artifact and must not carry arbitrary URLs, storage keys, markup, CSS, or provider fields.
- `ObjectStoragePort` currently stores JSON evidence/release artifacts only. It does not model untrusted binary uploads.
- `StaticSiteFile` currently stores UTF-8 text bodies only. It cannot carry image bytes through the deploy artifact boundary.

Media also crosses tenant authorization, upload security, worker recovery, object retention, preview rendering, release artifact construction, and rollback. Choosing only a UI file picker would leave those decisions hidden in implementation.

A focused Good Artist Inspiration pass used the local multi-driver storage catalog, AWS S3 presigned upload/metadata guidance, OWASP file-upload guidance, and Sharp's decoder/output safety behavior. The reusable pattern is private quarantine upload, deterministic worker normalization, opaque product references, and immutable deploy derivatives.

## Decision

### Product Truth And Ownership

Postgres owns media-asset identity, project ownership, lifecycle, actor evidence, processing truth, and derivative metadata. Object storage owns bytes. PageJson owns only placement intent.

The future persistence model is:

```text
media_assets
  id                    uuid, opaque product identity
  project_id            required tenant boundary
  kind                  image for MVP
  status                pending_upload | processing | ready | failed | archived
  display_name          bounded UI label, never an object key
  claimed_content_type  upload hint only
  expected_bytes        upload-intent size claim
  expected_sha256       upload-intent integrity binding
  detected_content_type worker-owned truth
  source_storage_key    private quarantine locator
  source_bytes          provider-observed size
  width / height        worker-observed dimensions
  checksum_sha256       worker-observed source digest
  processor_version     immutable normalization recipe id
  required_variant_keys exact derivative set for this processor/source width
  failure_code          stable bounded failure reason
  created_by_user_id    required persisted actor
  recovery_count        bounded processing recovery
  created_at / updated_at / processed_at / archived_at

media_asset_variants
  id
  media_asset_id
  variant_key           deterministic width/format key
  storage_key           private immutable derivative locator
  content_type
  width / height / bytes
  checksum_sha256

page_version_media_assets
  page_version_id
  media_asset_id
```

`page_version_media_assets` is a transactionally maintained reference projection from PageJson. It is not renderer truth. It exists to give retention, usage checks, and foreign-key protection a relational boundary without querying arbitrary JSONB.

Ready asset bytes, processor version, manifest, and derivative metadata are immutable. Replacing image content or regenerating it with a changed processor recipe creates a new asset id. Retries for the same processor version must produce the same keys/bytes. `archived` hides an asset from new selection but does not break historical, approved, released, superseded, or rollback-capable page versions.

`media_asset_variants` has a unique `(media_asset_id, variant_key)` constraint. A database trigger guards the transition to `ready`: the persisted variant rows must exactly match `required_variant_keys`, with no missing or extra keys. Variant insert/update/delete is rejected after the parent becomes `ready` or `archived`. The worker still decides and writes the required set, but the database prevents partial readiness or post-ready manifest drift.

### PageJson Reference Shape

PageJson receives one strict, contracts-owned reference shape:

```text
PageMediaReference
  assetId      UUID only
  purpose      content | decorative
  alt          non-empty bounded text for content; exactly empty for decorative
  focalPoint?  normalized x/y values from 0 through 1
```

The reference must not include a URL, object-storage key, provider name, MIME type, filename, responsive derivative, CSS class, style, crop expression, or arbitrary metadata. Alt text belongs to the concrete page placement, not the reusable asset row.

Registry prop schemas decide which section fields accept a media reference. Registry editor metadata will gain an `asset` control only when a section actually uses it. PageJson contract and registry validation prove shape; API/worker gates prove that every referenced asset belongs to the route project and is selectable/renderable.

New edits may select only `ready` assets. Existing versions may continue resolving `ready` or `archived` assets because archive is a library-visibility decision, not byte deletion.

### Upload Transport

Production upload uses a purpose-named `MediaAssetStoragePort` implemented by the S3 adapter. The existing JSON-focused `ObjectStoragePort` remains unchanged so evidence/artifact consumers and their test fakes do not gain unrelated binary methods.

The API creates a persisted upload intent only for a persisted actor with explicit media-write permission and project membership. Storage and the media-processing queue must both be configured before it accepts an upload; an unavailable dependency returns an explicit unavailable response without a pending asset row. The request includes the selected file's byte count, claimed allow-listed content type, and browser-computed SHA-256. Those values are upload constraints, not trusted media truth. The API generates the asset id and quarantine key. Production returns a short-lived presigned POST bound to:

- one exact private quarantine key,
- a maximum ten-minute validity,
- a 1-byte through 10 MiB content-length range,
- one allow-listed claimed content type,
- the expected SHA-256 checksum,
- server-owned project/asset metadata.

The client never chooses the bucket, object key, ACL, or storage path. The bucket is private. A presigned upload is staging transport, not a live page mutation: it cannot make an asset selectable, alter PageJson, approve a version, or publish bytes.

Presigned upload grants may be reused until expiration. Checksum binding closes that overwrite window: completion verifies provider-observed size/checksum, and the worker recomputes SHA-256 from the bytes it actually processes. A different late overwrite cannot become ready; rewriting identical bytes is harmless.

Local/test may expose an API-backed filesystem upload target behind the same upload-intent contract. It must enforce the same size/type/key rules and return explicit unconfigured status instead of production-looking success when storage is unavailable.

Intent creation is rate- and quota-limited before persistence. The MVP baseline allows at most five unresolved upload/processing assets, 250 retained ready/archived assets, and 2 GiB of normalized derivative bytes per project. These are startup-configured operational limits, not PageJson fields, and future billing tiers may narrow them without changing the asset contract.

After upload, an explicit completion request uses provider metadata reads to verify that the expected object exists and that its size, checksum, and content metadata fit the intent. The API then atomically moves the durable asset to `processing` and enqueues a deterministic `media-processing` job with `jobId = assetId`. It does not decode images in the HTTP request.

### Worker Validation And Normalization

The deterministic media worker owns all trust promotion. MVP accepts static JPEG, PNG, and WebP input only. SVG, GIF, animation, video, documents, remote URLs, and archive formats are rejected.

The worker must:

1. load the project-scoped `processing` row and private quarantine object;
2. cap downloaded bytes at 10 MiB;
3. identify the format from decoded content, not browser MIME or extension;
4. recompute SHA-256 and require the persisted upload-intent checksum;
5. reject multi-page/animated input;
6. apply an explicit 40-megapixel and bounded-dimension decoder limit;
7. auto-orient, convert to sRGB, and rewrite without EXIF/XMP/IPTC/GPS metadata;
8. emit deterministic WebP derivatives at the approved responsive widths without upscaling;
9. write derivatives under immutable server-generated keys;
10. persist every derivative and mark the asset `ready` only after all required writes succeed.

The initial responsive width set is `640, 960, 1440, 1920`, filtered to the source width, plus one final source-width derivative when the image is smaller than 640. Exact quality/effort values are implementation configuration owned by the versioned media processor and pinned by artifact tests, not PageJson. A processor upgrade never rewrites a ready asset's manifest or keys in place.

Stable failure codes include source missing, size mismatch, unsupported type, invalid image, animation rejected, pixel limit, storage failure, and processing failure. Public responses remain bounded; raw decoder/provider errors stay internal.

Media processing is an idempotent artifact-capture lane. The durable asset row is product truth, the deterministic job id is the transport key, derivative object keys are deterministic, and stale `processing` rows may use bounded DB-backed recovery. Exhaustion marks the asset failed and frees the operator to create a new upload. Generic recovery must not widen to deploy/rollback provider mutations.

### Rendering, Preview, And Deploy Parity

The registry renderer receives PageJson plus a fully resolved immutable media manifest. Missing, cross-project, non-renderable, or incomplete references fail closed before preview, approval, release planning, and deploy artifact construction.

The renderer emits deterministic root-relative paths such as:

```text
/assets/{assetId}/{checksum}-{width}.webp
```

It emits width/height, placement-owned alt semantics, and responsive `srcset` from the resolved manifest. It never emits an object-storage URL.

Preview and deploy use the same PageJson, resolved manifest, and renderer core. Before the first media section ships, preview transport must move from `iframe srcDoc` to an authenticated preview-document URL so root-relative `/assets/...` requests resolve through an object-authorized API asset handler. The deployed artifact uses the identical HTML paths and includes the same derivative bytes at those paths.

The preview iframe keeps `sandbox=""`; it must not gain `allow-same-origin` or `allow-scripts`. Normal SameSite session cookies are therefore not the media-subresource credential. After ordinary session/project authorization, the preview-document response issues a short-lived signed preview capability cookie scoped to `/assets`. Its claims bind the project id, page-version id, exact resolved asset/variant manifest, and expiration. Production uses `HttpOnly`, `Secure`, `SameSite=None`, `Partitioned`, a maximum five-minute lifetime, and `Cache-Control: private, no-store`. Partitioning keeps the embedded capability bound to the operator app's top-level site rather than becoming a reusable third-party cookie. The asset handler accepts only a valid capability whose manifest contains the requested immutable path. Local development must use a same-origin proxy or an explicitly non-production cookie mode that preserves the same capability checks. No token enters the HTML or asset path, so preview and deploy HTML remain byte-identical.

`StaticSiteFile` must become binary-safe before media reaches deploy. MVP uses an explicit discriminated content encoding (`utf8` or `base64`) rather than an optional second body field. This keeps each approved static artifact self-contained and provider-neutral. Existing HTML/CSS writers and the hosting adapter must migrate atomically. Artifact construction deduplicates files by path and enforces a 50 MiB decoded-byte budget before persistence/provider handoff. The hosting adapter must decode each file exactly once, calculate Netlify's SHA1 over the decoded byte buffer, and upload that same byte buffer. It must never hash the base64 transport string. The deploy worker resolves bytes and builds the complete artifact; the hosting adapter only decodes/uploads artifact bytes and must not import media, registry, or database logic.

Approval and release gates re-resolve referenced assets. An asset becoming archived does not invalidate an existing version. Missing derivative bytes, project mismatch, failed assets, or incomplete manifests block the operation rather than producing broken image URLs.

### Retention And Deletion

Uploaded originals and normalized derivatives remain private. Original filenames never become storage keys or public paths.

For MVP:

- pending uploads may expire and be cleaned after 24 hours;
- successfully normalized quarantine originals are deleted by an idempotent cleanup step within 24 hours of readiness;
- failed/unreferenced quarantine objects may be cleaned after a seven-day diagnostic window;
- ready assets may be archived but not hard-deleted while any page version references them;
- assets referenced by approved, release-candidate, released, superseded, or rollback-relevant versions retain their derivatives;
- hard deletion and deduplication remain deferred until reference projection and rollback retention are operationally proven.

Storage cleanup is a separate deterministic maintenance workflow. It must not infer safety from proposal status alone.

### Page Studio UX

The future media control is a project media library, not a URL input. Upload, processing, ready, failed, and archived states are durable server state owned by TanStack Query.

Selecting an asset, changing alt text, or setting a focal point is local staging. Only explicit confirmation posts the existing versioned Page Studio command with complete registry-owned props and creates N+1. Upload completion alone never creates or edits a page version.

The first implementation adds image media only. AI image generation, stock-provider search, remote URL import, freeform crop transforms, galleries, video, and automatic media replacement remain deferred.

## Consequences

- PageJson remains portable and provider-neutral.
- Tenant isolation and actor evidence are explicit at upload and resolution boundaries.
- Untrusted originals never become public page files.
- Image decoding and derivative generation move out of HTTP requests into a recoverable worker.
- Preview/deploy parity now requires a preview-document route and a binary-safe static artifact contract.
- The additional asset, variant, reference-projection, queue, worker, and cleanup lifecycle is real infrastructure cost.
- Archive is intentionally not deletion, preserving historical version and rollback integrity.

Implementation should proceed in three slices:

1. Backend foundation: contracts, permissions, DB tables/indexes, narrow binary storage port/adapters, upload intent/completion, media-processing worker, bounded recovery, and media library reads.
2. Renderer parity: binary-safe static artifacts, decoded-byte digest/upload parity in the hosting adapter, resolved media manifests, sandbox-preserving signed preview capability, authenticated preview document/asset serving, and deploy artifact bytes.
3. Page Studio media controls: first `ImageText` registry entry, asset editor control, upload/select/alt/focal-point UX, and N+1 application through the existing command endpoint.

## Alternatives Considered

### Raw Media URLs In PageJson

Rejected. URLs can leak providers, bypass project ownership and retention, disappear after approval, enable unsafe schemes/hosts, and make preview/deploy parity dependent on third-party availability.

### Store Original Bytes In Postgres

Rejected. Postgres owns metadata and references; large binary objects belong in object storage. Keeping bytes in DB would increase backup, query, and replication cost without improving the page lifecycle.

### Decode And Resize In The API Request

Rejected. Image decoding is CPU/memory-sensitive and failure-prone. It belongs in a bounded worker with durable state, deterministic keys, retries, and recovery.

### Public S3 Objects Or Direct Storage URLs

Rejected. The bucket remains private. Preview uses an authorized handler and deploy copies immutable derivatives into the approved static artifact.

### Extend Every Existing ObjectStoragePort Fake With Binary Methods

Rejected. JSON evidence/artifact storage and untrusted media ingestion are different capabilities. A narrower media port preserves interface segregation while allowing the same concrete S3/filesystem adapters to implement both.

### Delete Assets When A Version Is Superseded

Rejected. Superseded versions remain historical and may still matter for audit or rollback. Deletion requires reference and retention proof, not one lifecycle status.

## Regression Guard

- Do not add raw media URLs, object keys, provider fields, or arbitrary upload metadata to PageJson.
- Do not make uploaded bytes selectable or renderable before worker validation reaches `ready`.
- Do not trust browser MIME, extension, filename, or dimensions as media truth.
- Do not process images synchronously in a controller.
- Do not let upload completion create a page version, approval, release plan, or deploy.
- Do not let preview and deploy resolve different media manifests or HTML paths.
- Do not weaken the empty iframe sandbox or bake preview credentials into rendered HTML/asset paths; use a short-lived path-scoped preview capability.
- Do not hash base64 transport text for provider file digests; hash and upload the same decoded bytes.
- Do not mark an asset ready unless the database proves the exact required variant set exists.
- Do not let provider adapters render pages or query media product state.
- Do not hard-delete media referenced by page-version history or rollback evidence.

## Related Files

- `.ai-stealer-findings/2026-07-12-media-asset-upload-pipeline.md`
- `.ai-project-rules/15-architecture-regression-guards.md`
- `docs/architecture/decisions/0017-page-registry-and-page-json-source-of-truth.md`
- `docs/architecture/page-studio-layout-zone-editor.md`
- `docs/architecture/frontend-ui-and-page-registry.md`
- `docs/architecture/agent-first-mvp-roadmap.md`
- `packages/adapters/src/index.ts`
- `packages/contracts/src/index.ts`
- `packages/page-registry/src/index.ts`
