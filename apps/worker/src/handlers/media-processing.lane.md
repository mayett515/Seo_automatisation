---
lane: media-processing
domain: page
state: built
enforces: [G2, D2]
missing: []
consumes: [media-upload-intent]
produces: [media-asset-variants]
terminal: [media-asset-variants]
external: [media-upload-intent]
reason: ""
trigger: ""
proof: apps/worker/src/handlers/media-processing.integration.ts
---

## Is

- **D2** -> a processed asset attaches to a version rather than replacing what
  an approved version already shows. Media follows the same rule as copy: what
  was approved stays what was approved.
- **G2** -> an asset that failed to process is marked failed, and abandoned
  upload intents expire on a bounded window instead of lingering as pending
  work that never resolves.

## Is not

- Does not choose images. Selection and customer wishes come through page notes.
- Does not deploy assets. The release domain does that as part of the site
  artifact.
