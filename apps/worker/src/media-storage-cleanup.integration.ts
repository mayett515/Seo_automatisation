import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { buildCanonicalPageProposalOutputExample } from "@localseo/ai";
import {
  mediaDerivativeStoragePrefix,
  mediaQuarantineStorageKey,
  type MediaAssetCleanupStoragePort,
  type MediaPrivateObjectListing
} from "@localseo/adapters";
import {
  customers,
  mediaAssets,
  mediaAssetVariants,
  pageProposals,
  pageVersionMediaAssets,
  pageVersions,
  projects,
  users,
  type DatabaseClient
} from "@localseo/db";
import { eq } from "drizzle-orm";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../packages/db/test-support/integration-database.js";
import { scanMediaStorageCleanup } from "./media-storage-cleanup.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);
const now = new Date("2026-07-17T12:00:00.000Z");

void describe(
  "bounded media storage cleanup integration",
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

    void it("deletes a ready asset quarantine source while retaining immutable derivatives", async () => {
      const fixture = await createReadyAsset(db);
      const storage = new MemoryCleanupStorage([fixture.sourceKey, fixture.derivativeKey]);

      const result = await scan(db, storage);

      assert.equal(result.cleaned, 1);
      assert.equal(result.deleteRequests, 1);
      assert.equal(storage.objects.has(fixture.sourceKey), false);
      assert.equal(storage.objects.has(fixture.derivativeKey), true);
      const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, fixture.assetId));
      assert.equal(asset?.storageCleanupAttemptCount, 1);
      assert.equal(asset?.storageCleanupCompletedAt?.toISOString(), now.toISOString());
      assert.equal(asset?.storageCleanupClaimedAt, null);
    });

    void it("deletes unreferenced failed quarantine and derivative-prefix objects after seven days", async () => {
      const fixture = await createFailedAsset(db);
      const prefix = mediaDerivativeStoragePrefix(fixture.projectId, fixture.assetId);
      const derivativeKeys = [`${prefix}v1/first.webp`, `${prefix}v1/second.webp`];
      const storage = new MemoryCleanupStorage([fixture.sourceKey, ...derivativeKeys]);

      const result = await scan(db, storage);

      assert.equal(result.cleaned, 1);
      assert.equal(result.deleteRequests, 3);
      assert.deepEqual([...storage.objects], []);
      const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, fixture.assetId));
      assert.equal(asset?.storageCleanupCompletedAt?.toISOString(), now.toISOString());
    });

    void it("does not clean a failed asset while page-version retention evidence references it", async () => {
      const fixture = await createFailedAsset(db);
      await createPageVersionReference(db, fixture.projectId, fixture.assetId);
      const storage = new MemoryCleanupStorage([fixture.sourceKey]);

      const result = await scan(db, storage);

      assert.equal(result.checked, 0);
      assert.equal(result.cleaned, 0);
      assert.equal(storage.objects.has(fixture.sourceKey), true);
      const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, fixture.assetId));
      assert.equal(asset?.storageCleanupAttemptCount, 0);
      assert.equal(asset?.storageCleanupCompletedAt, null);
    });

    void it("bounds repeated provider failures and leaves durable exhaustion evidence", async () => {
      const fixture = await createReadyAsset(db);
      const storage = new FailingCleanupStorage([fixture.sourceKey]);

      const first = await scan(db, storage, { maxAttempts: 2 });
      const second = await scan(db, storage, { maxAttempts: 2 });
      const third = await scan(db, storage, { maxAttempts: 2 });

      assert.equal(first.retryableFailures, 1);
      assert.equal(second.exhausted, 1);
      assert.equal(third.checked, 0);
      assert.equal(storage.deleteCalls.length, 2);
      const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, fixture.assetId));
      assert.equal(asset?.storageCleanupAttemptCount, 2);
      assert.equal(asset?.storageCleanupCompletedAt, null);
      assert.equal(asset?.storageCleanupFailureCode, "storage_cleanup_exhausted");
      assert.match(asset?.storageCleanupFailureMessage ?? "", /storage unavailable/u);
    });

    void it("retries a stale claim idempotently after the quarantine source is already absent", async () => {
      const fixture = await createReadyAsset(db);
      const staleClaimedAt = new Date(now.getTime() - 16 * 60_000);
      await db
        .update(mediaAssets)
        .set({
          storageCleanupAttemptCount: 1,
          lastStorageCleanupAt: staleClaimedAt,
          storageCleanupClaimedAt: staleClaimedAt
        })
        .where(eq(mediaAssets.id, fixture.assetId));
      const storage = new MemoryCleanupStorage([fixture.derivativeKey]);

      const result = await scan(db, storage);

      assert.equal(result.cleaned, 1);
      assert.equal(result.deleteRequests, 1);
      assert.deepEqual(storage.deleteCalls, [fixture.sourceKey]);
      assert.equal(storage.objects.has(fixture.derivativeKey), true);
      const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, fixture.assetId));
      assert.equal(asset?.storageCleanupAttemptCount, 2);
      assert.equal(asset?.storageCleanupClaimedAt, null);
      assert.equal(asset?.storageCleanupCompletedAt?.toISOString(), now.toISOString());
    });

    void it("terminalizes a stale final cleanup claim without issuing an unbounded delete", async () => {
      const fixture = await createReadyAsset(db);
      const staleClaimedAt = new Date(now.getTime() - 16 * 60_000);
      await db
        .update(mediaAssets)
        .set({
          storageCleanupAttemptCount: 2,
          lastStorageCleanupAt: staleClaimedAt,
          storageCleanupClaimedAt: staleClaimedAt
        })
        .where(eq(mediaAssets.id, fixture.assetId));
      const storage = new MemoryCleanupStorage([fixture.sourceKey, fixture.derivativeKey]);

      const result = await scan(db, storage, { maxAttempts: 2 });

      assert.equal(result.exhausted, 1);
      assert.equal(result.cleaned, 0);
      assert.equal(storage.deleteCalls.length, 0);
      assert.equal(storage.objects.has(fixture.sourceKey), true);
      const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, fixture.assetId));
      assert.equal(asset?.storageCleanupAttemptCount, 2);
      assert.equal(asset?.storageCleanupClaimedAt, null);
      assert.equal(asset?.storageCleanupFailureCode, "storage_cleanup_exhausted");
      assert.match(asset?.storageCleanupFailureMessage ?? "", /2 bounded attempts/u);
    });

    void it("allows only one of two cleanup scanners to own a fresh asset claim", async () => {
      const fixture = await createReadyAsset(db);
      const storage = new BarrierCleanupStorage([fixture.sourceKey]);

      const firstScan = scan(db, storage);
      await storage.waitUntilDeleteStarts();
      const second = await scan(db, storage);
      storage.releaseDelete();
      const first = await firstScan;

      assert.equal(first.cleaned + second.cleaned, 1);
      assert.equal(storage.deleteCalls.length, 1);
      const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, fixture.assetId));
      assert.equal(asset?.storageCleanupAttemptCount, 1);
      assert.equal(asset?.storageCleanupCompletedAt?.toISOString(), now.toISOString());
    });
  }
);

async function scan(db: DatabaseClient, storage: MediaAssetCleanupStoragePort, input: { maxAttempts?: number } = {}) {
  return scanMediaStorageCleanup({
    db,
    storage,
    now,
    claimStaleAfterMs: 15 * 60_000,
    maxAttempts: input.maxAttempts ?? 3,
    batchSize: 25
  });
}

async function createProjectAndUser(db: DatabaseClient): Promise<{ projectId: string; userId: string }> {
  const [customer] = await db.insert(customers).values({ name: "Cleanup Customer" }).returning();
  assert.ok(customer);
  const [project] = await db.insert(projects).values({ customerId: customer.id, name: "Cleanup Project" }).returning();
  assert.ok(project);
  const [user] = await db
    .insert(users)
    .values({ email: `${randomUUID()}@example.com`, name: "Cleanup Operator" })
    .returning();
  assert.ok(user);
  return { projectId: project.id, userId: user.id };
}

async function createReadyAsset(db: DatabaseClient): Promise<{
  assetId: string;
  projectId: string;
  sourceKey: string;
  derivativeKey: string;
}> {
  const { projectId, userId } = await createProjectAndUser(db);
  const assetId = randomUUID();
  const sourceKey = mediaQuarantineStorageKey(projectId, assetId);
  const sourceSha256 = "a".repeat(64);
  const derivativeKey = `${mediaDerivativeStoragePrefix(projectId, assetId)}processor/${sourceSha256}-w640.webp`;
  await db.insert(mediaAssets).values({
    id: assetId,
    projectId,
    displayName: "Ready image",
    claimedContentType: "image/png",
    expectedBytes: 100,
    expectedSha256: sourceSha256,
    sourceStorageKey: sourceKey,
    createdByUserId: userId,
    updatedAt: new Date("2026-07-17T11:00:00.000Z")
  });
  await db.update(mediaAssets).set({ status: "processing" }).where(eq(mediaAssets.id, assetId));
  await db.insert(mediaAssetVariants).values({
    mediaAssetId: assetId,
    variantKey: "w640_webp",
    storageKey: derivativeKey,
    contentType: "image/webp",
    width: 640,
    height: 360,
    bytes: 80,
    checksumSha256: "b".repeat(64)
  });
  await db
    .update(mediaAssets)
    .set({
      status: "ready",
      detectedContentType: "image/png",
      sourceBytes: 100,
      width: 640,
      height: 360,
      checksumSha256: sourceSha256,
      processorVersion: "processor",
      requiredVariantKeys: ["w640_webp"],
      processedAt: new Date("2026-07-17T11:01:00.000Z"),
      updatedAt: new Date("2026-07-17T11:01:00.000Z")
    })
    .where(eq(mediaAssets.id, assetId));
  return { assetId, projectId, sourceKey, derivativeKey };
}

async function createFailedAsset(db: DatabaseClient): Promise<{
  assetId: string;
  projectId: string;
  sourceKey: string;
}> {
  const { projectId, userId } = await createProjectAndUser(db);
  const assetId = randomUUID();
  const sourceKey = mediaQuarantineStorageKey(projectId, assetId);
  await db.insert(mediaAssets).values({
    id: assetId,
    projectId,
    displayName: "Failed image",
    claimedContentType: "image/png",
    expectedBytes: 100,
    expectedSha256: "c".repeat(64),
    sourceStorageKey: sourceKey,
    createdByUserId: userId
  });
  await db
    .update(mediaAssets)
    .set({
      status: "failed",
      failureCode: "invalid_image",
      failureMessage: "Image could not be decoded.",
      updatedAt: new Date(now.getTime() - 8 * 24 * 60 * 60_000)
    })
    .where(eq(mediaAssets.id, assetId));
  return { assetId, projectId, sourceKey };
}

async function createPageVersionReference(db: DatabaseClient, projectId: string, assetId: string): Promise<void> {
  const page = buildCanonicalPageProposalOutputExample({
    projectId,
    opportunityId: randomUUID(),
    agentRunId: randomUUID()
  }).page;
  const [proposal] = await db
    .insert(pageProposals)
    .values({
      projectId,
      route: page.route,
      primaryKeyword: page.target.primaryKeyword,
      uniquenessRationale: page.uniquenessRationale ?? "Cleanup retention test.",
      status: "draft",
      sitemapReady: page.seo.sitemapReady
    })
    .returning();
  assert.ok(proposal);
  const [version] = await db
    .insert(pageVersions)
    .values({ pageProposalId: proposal.id, versionNumber: 1, status: "preview", pageJson: page })
    .returning();
  assert.ok(version);
  await db.insert(pageVersionMediaAssets).values({ pageVersionId: version.id, mediaAssetId: assetId });
}

class MemoryCleanupStorage implements MediaAssetCleanupStoragePort {
  readonly objects: Set<string>;
  readonly deleteCalls: string[] = [];

  constructor(keys: string[]) {
    this.objects = new Set(keys);
  }

  listPrivateObjectKeys(input: { prefix: string; maxKeys: number }): Promise<MediaPrivateObjectListing> {
    const keys = [...this.objects].filter((key) => key.startsWith(input.prefix)).sort();
    return Promise.resolve({
      keys: keys.slice(0, input.maxKeys),
      truncated: keys.length > input.maxKeys
    });
  }

  deletePrivateObject(input: { key: string }): Promise<void> {
    this.deleteCalls.push(input.key);
    this.objects.delete(input.key);
    return Promise.resolve();
  }
}

class FailingCleanupStorage extends MemoryCleanupStorage {
  override deletePrivateObject(input: { key: string }): Promise<void> {
    this.deleteCalls.push(input.key);
    return Promise.reject(new Error("storage unavailable"));
  }
}

class BarrierCleanupStorage extends MemoryCleanupStorage {
  private readonly started: Promise<void>;
  private signalStarted!: () => void;
  private readonly released: Promise<void>;
  private signalReleased!: () => void;

  constructor(keys: string[]) {
    super(keys);
    this.started = new Promise((resolve) => {
      this.signalStarted = resolve;
    });
    this.released = new Promise((resolve) => {
      this.signalReleased = resolve;
    });
  }

  waitUntilDeleteStarts(): Promise<void> {
    return this.started;
  }

  releaseDelete(): void {
    this.signalReleased();
  }

  override async deletePrivateObject(input: { key: string }): Promise<void> {
    this.signalStarted();
    await this.released;
    await super.deletePrivateObject(input);
  }
}
