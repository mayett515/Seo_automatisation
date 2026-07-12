import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MediaAssetStoragePort, MediaStoredObjectMetadata, MediaUploadGrant } from "@localseo/adapters";
import { mediaAssets } from "@localseo/db";
import sharp from "sharp";
import {
  executeMediaProcessing,
  MediaProcessingEvidenceError,
  requiredWidths,
  type MediaProcessingRepository,
  type ProcessedMediaVariant
} from "./media-processing.js";

type MediaAssetRow = typeof mediaAssets.$inferSelect;

void describe("media processing worker", () => {
  void it("normalizes bounded source bytes into deterministic responsive WebP variants", async () => {
    const source = await sharp({
      create: { width: 1000, height: 500, channels: 3, background: { r: 30, g: 80, b: 120 } }
    })
      .jpeg()
      .toBuffer();
    const fixture = createFixture(source, "image/jpeg");
    const repository = new MemoryMediaRepository(fixture.row);
    const storage = new MemoryMediaStorage(fixture.row.sourceStorageKey, source, "image/jpeg", fixture.sha256);

    const result = await executeMediaProcessing({
      data: { projectId: fixture.row.projectId, assetId: fixture.row.id },
      repository,
      storage
    });

    assert.equal(result.status, "ready");
    assert.deepEqual(requiredWidths(1000), [640, 960]);
    assert.deepEqual(
      repository.ready?.variants.map((variant) => variant.variantKey),
      ["w640_webp", "w960_webp"]
    );
    assert.equal(repository.ready?.detectedContentType, "image/jpeg");
    assert.equal(storage.writes.length, 2);
    assert.ok(storage.writes.every((write) => write.contentType === "image/webp"));
    assert.ok(storage.writes.every((write) => write.key.includes(fixture.sha256)));
  });

  void it("terminalizes deterministic checksum mismatches without writing derivatives", async () => {
    const source = await sharp({
      create: { width: 100, height: 50, channels: 3, background: { r: 1, g: 2, b: 3 } }
    })
      .png()
      .toBuffer();
    const fixture = createFixture(source, "image/png");
    fixture.row.expectedSha256 = "0".repeat(64);
    const repository = new MemoryMediaRepository(fixture.row);
    const storage = new MemoryMediaStorage(fixture.row.sourceStorageKey, source, "image/png", fixture.sha256);

    await assert.rejects(
      executeMediaProcessing({
        data: { projectId: fixture.row.projectId, assetId: fixture.row.id },
        repository,
        storage
      }),
      (error: unknown) => error instanceof MediaProcessingEvidenceError && error.failureCode === "checksum_mismatch"
    );
    assert.equal(repository.failed?.failureCode, "checksum_mismatch");
    assert.equal(storage.writes.length, 0);
  });
});

function createFixture(source: Uint8Array, claimedContentType: string) {
  const now = new Date("2026-07-12T10:00:00.000Z");
  const sha256 = createHash("sha256").update(source).digest("hex");
  const projectId = randomUUID();
  const assetId = randomUUID();
  const row: MediaAssetRow = {
    id: assetId,
    projectId,
    kind: "image",
    status: "processing",
    displayName: "source",
    claimedContentType,
    expectedBytes: source.byteLength,
    expectedSha256: sha256,
    detectedContentType: null,
    sourceStorageKey: `media/quarantine/${projectId}/${assetId}/source`,
    sourceBytes: null,
    width: null,
    height: null,
    checksumSha256: null,
    processorVersion: null,
    requiredVariantKeys: null,
    failureCode: null,
    failureMessage: null,
    createdByUserId: randomUUID(),
    archivedByUserId: null,
    recoveryCount: 0,
    lastRecoveryAt: null,
    processedAt: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now
  };
  return { row, sha256 };
}

class MemoryMediaRepository implements MediaProcessingRepository {
  ready:
    | {
        detectedContentType: string;
        variants: ProcessedMediaVariant[];
      }
    | undefined;
  failed: { failureCode: string; failureMessage: string } | undefined;

  constructor(private readonly row: MediaAssetRow) {}

  loadAsset(): Promise<MediaAssetRow> {
    return Promise.resolve(this.row);
  }

  persistReady(input: Parameters<MediaProcessingRepository["persistReady"]>[0]): Promise<void> {
    this.ready = { detectedContentType: input.detectedContentType, variants: input.variants };
    return Promise.resolve();
  }

  markFailed(input: Parameters<MediaProcessingRepository["markFailed"]>[0]): Promise<void> {
    this.failed = { failureCode: input.failureCode, failureMessage: input.failureMessage };
    return Promise.resolve();
  }
}

class MemoryMediaStorage implements MediaAssetStoragePort {
  readonly writes: Array<{ key: string; body: Uint8Array; contentType: string; sha256: string }> = [];

  constructor(
    private readonly sourceKey: string,
    private readonly source: Uint8Array,
    private readonly contentType: string,
    private readonly sha256: string
  ) {}

  createUploadGrant(): Promise<MediaUploadGrant> {
    throw new Error("not used");
  }

  headPrivateObject(input: { key: string }): Promise<MediaStoredObjectMetadata | undefined> {
    return Promise.resolve(
      input.key === this.sourceKey
        ? {
            key: input.key,
            contentType: this.contentType,
            contentLength: this.source.byteLength,
            sha256: this.sha256
          }
        : undefined
    );
  }

  readPrivateObject(input: { key: string; maxBytes: number }): Promise<Uint8Array> {
    if (input.key !== this.sourceKey || this.source.byteLength > input.maxBytes) {
      throw new Error("source unavailable");
    }
    return Promise.resolve(this.source);
  }

  putPrivateObject(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
    sha256: string;
  }): Promise<MediaStoredObjectMetadata> {
    this.writes.push(input);
    return Promise.resolve({
      key: input.key,
      contentType: input.contentType,
      contentLength: input.body.byteLength,
      sha256: input.sha256
    });
  }

  deletePrivateObject(): Promise<void> {
    return Promise.resolve();
  }
}
