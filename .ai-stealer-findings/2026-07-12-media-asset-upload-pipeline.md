# Finding: Project-Scoped Media Asset Upload Pipeline

Date: 2026-07-12

Sources:

- Local catalog: `unjs/unstorage` multi-driver adapter pattern in `.ai-stealer-catalog/repo-catalog/index/module-intent-index.md`
- AWS S3 POST policy: https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sigv4-HTTPPOSTConstructPolicy.html
- AWS SDK for JavaScript v3 presigned POST: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-s3-presigned-post/Function/createPresignedPost3/
- AWS S3 `HeadObject`: https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html
- OWASP File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- Sharp input limits and metadata behavior: https://sharp.pixelplumbing.com/api-constructor/ and https://sharp.pixelplumbing.com/api-output/
- MDN partitioned cookies for embedded content: https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies/Partitioned_cookies

License: No source code copied. These are architecture and security patterns adapted to this repository.

## What We Needed

Page Studio needs image selection and upload without weakening the existing PageJson safety boundary, bypassing project tenancy, or creating a second renderer/deploy path. The current `ObjectStoragePort` stores JSON evidence and release artifacts, while `StaticSiteFile` is text-only. Neither boundary is sufficient for untrusted image ingestion or binary deploy files.

## What The Sources Do Well

The local catalog reinforces one narrow port with provider-specific adapters rather than vendor fields in domain data.

AWS presigned POST policies can bind one short-lived upload to a server-generated key, exact form fields, and a `content-length-range`. `HeadObject` can verify provider-observed size and metadata before processing begins.

OWASP recommends allow-listed formats, generated filenames, authorization, size limits, content/signature validation, storage outside the web root, and image rewriting before public serving.

Sharp exposes decoder pixel/channel limits and strips metadata by default when output is rewritten. That supports a deterministic image-normalization worker instead of trusting the uploaded MIME type or original bytes.

## What We Steal

- Store an opaque project-scoped asset id in PageJson, never a provider URL or key.
- Upload to a private quarantine key through a short-lived, narrowly constrained transport grant bound to the selected file's SHA-256.
- Treat browser content type and filename as hints only; validate decoded bytes in a worker.
- Rewrite accepted raster images into immutable derivatives with generated names and stripped metadata.
- Keep upload/processing product truth in Postgres and object bytes in storage.
- Make processing retry-safe through deterministic keys and a durable DB-before-queue lifecycle.
- Freeze the ready manifest and processor version so a later normalization change receives a new asset id instead of changing approved page output.
- Keep originals and derivatives private; only preview handlers and release artifacts expose validated derivatives.

## How It Maps To Our Stack

```text
React/TanStack media picker
-> Nest API creates project-scoped upload intent
-> browser uploads to private quarantine transport
-> API confirms provider-observed object and enqueues media-processing
-> BullMQ worker decodes, validates, rewrites, and persists immutable derivatives
-> media_assets + media_asset_variants own durable metadata
-> PageJson stores PageMediaReference { assetId, purpose, alt, focalPoint? }
-> API/worker resolve project-owned ready assets before version persistence/approval/release
-> page-registry renderer emits deterministic /assets/... paths
-> preview serves those paths under authorization
-> deploy artifact carries the same derivative bytes and HTML paths
```

The existing JSON-focused `ObjectStoragePort` remains intact. A future narrow `MediaAssetStoragePort` owns binary upload grants, metadata reads, byte reads/writes, and cleanup; S3/filesystem adapters may implement both ports without widening every existing test fake.

Presigned grants can be replayed until they expire. The browser therefore computes SHA-256 before requesting an intent; the signed upload, persisted intent, provider metadata check, and worker digest all bind to that value. A different late overwrite fails processing, while an identical overwrite is harmless.

The sandboxed preview keeps an opaque origin. A five-minute `HttpOnly; Secure; SameSite=None; Partitioned` capability cookie scoped to `/assets` authorizes only the exact resolved manifest without placing credentials in HTML or asset paths.

## Decision

Adopt the staged, worker-normalized, project-scoped asset model in ADR 0020. Do not add raw URLs, object keys, SVG, animated media, or direct PageJson writes as shortcuts. Implement the backend upload/processing foundation before Page Studio media controls.
