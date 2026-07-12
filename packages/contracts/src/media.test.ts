import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CreateMediaUploadIntentRequestSchema,
  MediaAssetSummarySchema,
  MediaProcessingJobDataSchema,
  PageMediaReferenceSchema,
  MediaUploadIntentResponseSchema
} from "./index.js";

const sha256 = "a".repeat(64);

void describe("media asset contracts", () => {
  void it("accepts one bounded checksum-bound image upload intent", () => {
    assert.deepEqual(
      CreateMediaUploadIntentRequestSchema.parse({
        displayName: "Team photo.jpg",
        claimedContentType: "image/jpeg",
        expectedBytes: 42,
        expectedSha256: sha256
      }),
      {
        displayName: "Team photo.jpg",
        claimedContentType: "image/jpeg",
        expectedBytes: 42,
        expectedSha256: sha256
      }
    );
  });

  void it("rejects arbitrary media types, oversized input, and client-owned storage fields", () => {
    assert.equal(
      CreateMediaUploadIntentRequestSchema.safeParse({
        displayName: "vector.svg",
        claimedContentType: "image/svg+xml",
        expectedBytes: 11 * 1024 * 1024,
        expectedSha256: sha256,
        storageKey: "attacker-owned"
      }).success,
      false
    );
  });

  void it("keeps upload targets transport-only and media summaries free of storage keys", () => {
    const asset = MediaAssetSummarySchema.parse({
      id: "10000000-0000-4000-8000-000000000001",
      projectId: "10000000-0000-4000-8000-000000000002",
      status: "pending_upload",
      displayName: "photo.jpg",
      claimedContentType: "image/jpeg",
      expectedBytes: 42,
      expectedSha256: sha256,
      variants: [],
      createdByUserId: "10000000-0000-4000-8000-000000000003",
      createdAt: "2026-07-12T10:00:00.000Z",
      updatedAt: "2026-07-12T10:00:00.000Z"
    });
    const response = MediaUploadIntentResponseSchema.parse({
      asset,
      upload: {
        kind: "api_put",
        url: "/projects/p/media/assets/a/content",
        headers: { "x-media-sha256": sha256 },
        expiresAt: "2026-07-12T10:10:00.000Z"
      }
    });

    assert.equal("sourceStorageKey" in response.asset, false);
    assert.equal("storageKey" in response.asset, false);
  });

  void it("pins deterministic media-processing jobs to project and asset UUIDs", () => {
    assert.equal(
      MediaProcessingJobDataSchema.safeParse({
        projectId: "10000000-0000-4000-8000-000000000002",
        assetId: "10000000-0000-4000-8000-000000000001",
        triggerSource: "media_upload_completion"
      }).success,
      true
    );
    assert.equal(
      MediaProcessingJobDataSchema.safeParse({ projectId: "project", assetId: "not-an-asset-id" }).success,
      false
    );
  });

  void it("keeps future PageJson placement references opaque and accessibility-explicit", () => {
    const assetId = "10000000-0000-4000-8000-000000000001";
    assert.equal(
      PageMediaReferenceSchema.safeParse({
        assetId,
        purpose: "content",
        alt: "Team vor dem Firmenstandort",
        focalPoint: { x: 0.5, y: 0.4 }
      }).success,
      true
    );
    assert.equal(
      PageMediaReferenceSchema.safeParse({ assetId, purpose: "decorative", alt: "must be empty" }).success,
      false
    );
    assert.equal(
      PageMediaReferenceSchema.safeParse({
        assetId,
        purpose: "content",
        alt: "Image",
        url: "https://storage.example/image.webp"
      }).success,
      false
    );
  });
});
