import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { MediaAssetStoragePort, MediaStoredObjectMetadata, MediaUploadGrant } from "@localseo/adapters";
import { customers, mediaAssets, mediaAssetVariants, projects, users, type DatabaseClient } from "@localseo/db";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";
import { createDrizzleMediaProcessingRepository, executeMediaProcessing } from "./media-processing.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);

void describe(
  "media processing worker database integration",
  { skip: runIntegration ? false : "TEST_DATABASE_URL is not configured" },
  () => {
    let handle: IntegrationDatabase;
    let db: DatabaseClient;

    before(async () => {
      assert.ok(testDatabaseUrl);
      handle = await createIntegrationTestDatabase(testDatabaseUrl);
      db = handle.db;
    });

    beforeEach(async () => {
      await truncateIntegrationTables(handle.sql);
    });

    after(async () => {
      await handle?.close();
    });

    void it("promotes verified source bytes to an exact immutable ready derivative set", async () => {
      const source = await sharp({
        create: { width: 800, height: 400, channels: 3, background: { r: 20, g: 90, b: 140 } }
      })
        .png()
        .toBuffer();
      const fixture = await createMediaFixture(db, source);
      const storage = new MemoryMediaStorage();
      storage.objects.set(fixture.sourceKey, {
        body: source,
        contentType: "image/png",
        sha256: fixture.sha256
      });

      const result = await executeMediaProcessing({
        data: { projectId: fixture.projectId, assetId: fixture.assetId },
        repository: createDrizzleMediaProcessingRepository(db),
        storage
      });

      assert.equal(result.status, "ready");
      const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, fixture.assetId));
      assert.equal(asset?.status, "ready");
      assert.equal(asset?.detectedContentType, "image/png");
      assert.deepEqual(asset?.requiredVariantKeys, ["w640_webp"]);
      assert.equal(asset?.processorVersion, "sharp-webp-v1-q82-e4");
      const variants = await db
        .select()
        .from(mediaAssetVariants)
        .where(eq(mediaAssetVariants.mediaAssetId, fixture.assetId));
      assert.equal(variants.length, 1);
      assert.equal(variants[0]?.width, 640);
      assert.equal(variants[0]?.contentType, "image/webp");
      assert.match(variants[0]?.storageKey ?? "", /media\/ready\/.+-w640\.webp$/u);

      await assert.rejects(
        db
          .update(mediaAssetVariants)
          .set({ bytes: (variants[0]?.bytes ?? 1) + 1 })
          .where(eq(mediaAssetVariants.id, variants[0]?.id ?? "")),
        (error: unknown) => errorChainIncludes(error, /ready media asset variants are immutable/u)
      );

      await assert.rejects(db.delete(mediaAssets).where(eq(mediaAssets.id, fixture.assetId)), (error: unknown) =>
        errorChainIncludes(error, /ready or archived media assets cannot be hard-deleted/u)
      );

      await db
        .update(mediaAssets)
        .set({ status: "archived", archivedAt: new Date(), archivedByUserId: fixture.userId })
        .where(eq(mediaAssets.id, fixture.assetId));
      await assert.rejects(db.delete(mediaAssets).where(eq(mediaAssets.id, fixture.assetId)), (error: unknown) =>
        errorChainIncludes(error, /ready or archived media assets cannot be hard-deleted/u)
      );
    });

    void it("rejects a ready transition until every required variant row exists", async () => {
      const source = await sharp({
        create: { width: 320, height: 180, channels: 3, background: { r: 10, g: 20, b: 30 } }
      })
        .png()
        .toBuffer();
      const fixture = await createMediaFixture(db, source);

      await assert.rejects(
        db
          .update(mediaAssets)
          .set({
            status: "ready",
            detectedContentType: "image/png",
            sourceBytes: source.byteLength,
            width: 320,
            height: 180,
            checksumSha256: fixture.sha256,
            processorVersion: "test-v1",
            requiredVariantKeys: ["w320_webp"],
            processedAt: new Date()
          })
          .where(eq(mediaAssets.id, fixture.assetId)),
        (error: unknown) => errorChainIncludes(error, /exact persisted derivative set/u)
      );

      const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, fixture.assetId));
      assert.equal(asset?.status, "processing");
    });

    void it("marks deterministic checksum mismatches failed without derivative rows", async () => {
      const expected = await sharp({
        create: { width: 64, height: 64, channels: 3, background: { r: 1, g: 2, b: 3 } }
      })
        .png()
        .toBuffer();
      const fixture = await createMediaFixture(db, expected);
      const changed = Buffer.from(expected);
      changed[changed.length - 1] = (changed[changed.length - 1] ?? 0) ^ 1;
      const storage = new MemoryMediaStorage();
      storage.objects.set(fixture.sourceKey, {
        body: changed,
        contentType: "image/png",
        sha256: fixture.sha256
      });

      await assert.rejects(
        executeMediaProcessing({
          data: { projectId: fixture.projectId, assetId: fixture.assetId },
          repository: createDrizzleMediaProcessingRepository(db),
          storage
        }),
        /checksum/u
      );

      const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, fixture.assetId));
      assert.equal(asset?.status, "failed");
      assert.equal(asset?.failureCode, "checksum_mismatch");
      const variants = await db
        .select()
        .from(mediaAssetVariants)
        .where(eq(mediaAssetVariants.mediaAssetId, fixture.assetId));
      assert.equal(variants.length, 0);
    });
  }
);

async function createMediaFixture(db: DatabaseClient, source: Uint8Array) {
  const userId = randomUUID();
  const customerId = randomUUID();
  const projectId = randomUUID();
  const assetId = randomUUID();
  const sourceKey = `media/quarantine/${projectId}/${assetId}/source`;
  const sha256 = createHash("sha256").update(source).digest("hex");
  await db.insert(users).values({ id: userId, email: `${userId}@example.test`, name: "Media owner" });
  await db.insert(customers).values({ id: customerId, ownerUserId: userId, name: "Media customer" });
  await db.insert(projects).values({ id: projectId, customerId, name: "Media project", status: "active" });
  await db.insert(mediaAssets).values({
    id: assetId,
    projectId,
    status: "pending_upload",
    displayName: "source.png",
    claimedContentType: "image/png",
    expectedBytes: source.byteLength,
    expectedSha256: sha256,
    sourceStorageKey: sourceKey,
    createdByUserId: userId
  });
  await db.update(mediaAssets).set({ status: "processing" }).where(eq(mediaAssets.id, assetId));
  return { userId, projectId, assetId, sourceKey, sha256 };
}

class MemoryMediaStorage implements MediaAssetStoragePort {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string; sha256: string }>();

  createUploadGrant(): Promise<MediaUploadGrant> {
    throw new Error("not used");
  }

  headPrivateObject(input: { key: string }): Promise<MediaStoredObjectMetadata | undefined> {
    const value = this.objects.get(input.key);
    return Promise.resolve(
      value
        ? { key: input.key, contentType: value.contentType, contentLength: value.body.byteLength, sha256: value.sha256 }
        : undefined
    );
  }

  readPrivateObject(input: { key: string; maxBytes: number }): Promise<Uint8Array> {
    const value = this.objects.get(input.key);
    if (!value || value.body.byteLength > input.maxBytes) {
      throw new Error("media object unavailable");
    }
    return Promise.resolve(value.body);
  }

  putPrivateObject(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
    sha256: string;
  }): Promise<MediaStoredObjectMetadata> {
    this.objects.set(input.key, { body: input.body, contentType: input.contentType, sha256: input.sha256 });
    return Promise.resolve({
      key: input.key,
      contentType: input.contentType,
      contentLength: input.body.byteLength,
      sha256: input.sha256
    });
  }

  deletePrivateObject(input: { key: string }): Promise<void> {
    this.objects.delete(input.key);
    return Promise.resolve();
  }
}

function errorChainIncludes(error: unknown, pattern: RegExp): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error && pattern.test(current.message)) {
      return true;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}
