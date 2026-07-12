import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { MediaAssetStoragePort, MediaStoredObjectMetadata, MediaUploadGrant } from "@localseo/adapters";
import { customers, jobRuns, mediaAssets, projects, users, type DatabaseClient } from "@localseo/db";
import type { JobsOptions } from "bullmq";
import { eq } from "drizzle-orm";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";
import { DatabaseService } from "../database/database.service.js";
import { QueueProducerService } from "../queue-producer.js";
import { MediaService } from "./media.module.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);

void describe(
  "MediaService integration",
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

    void it("persists a checksum-bound upload intent without exposing the server storage key", async () => {
      const fixture = await createProjectFixture(db, "Intent");
      const storage = new MemoryMediaStorage();
      const queueService = configuredQueueService(db);
      const service = new MediaService(testDatabaseService(db), queueService, storage);
      const source = Buffer.from("bounded-media-source");
      const sha256 = digest(source);

      const result = await service.createUploadIntent(
        fixture.projectId,
        {
          displayName: "office.png",
          claimedContentType: "image/png",
          expectedBytes: source.byteLength,
          expectedSha256: sha256
        },
        fixture.userId
      );

      assert.equal(result.asset.status, "pending_upload");
      assert.equal(result.asset.createdByUserId, fixture.userId);
      assert.equal(result.upload.kind, "api_put");
      assert.equal("sourceStorageKey" in (result.asset as unknown as Record<string, unknown>), false);
      assert.equal(storage.grants[0]?.projectId, fixture.projectId);
      assert.equal(storage.grants[0]?.assetId, result.asset.id);
      assert.match(storage.grants[0]?.key ?? "", new RegExp(`${fixture.projectId}/${result.asset.id}/source$`, "u"));

      const [row] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, result.asset.id));
      assert.equal(row?.expectedSha256, sha256);
      assert.equal(row?.status, "pending_upload");
    });

    void it("fails closed before persistence when media processing transport is unavailable", async () => {
      const fixture = await createProjectFixture(db, "Unavailable");
      const service = new MediaService(
        testDatabaseService(db),
        new QueueProducerService(testDatabaseService(db)),
        new MemoryMediaStorage()
      );

      await assert.rejects(
        service.createUploadIntent(
          fixture.projectId,
          {
            displayName: "office.png",
            claimedContentType: "image/png",
            expectedBytes: 4,
            expectedSha256: "a".repeat(64)
          },
          fixture.userId
        ),
        /media-processing queue is not configured/u
      );
      assert.equal((await db.select().from(mediaAssets)).length, 0);
    });

    void it("accepts local bytes, completes the intent, and queues deterministic media processing", async () => {
      const fixture = await createProjectFixture(db, "Complete");
      const storage = new MemoryMediaStorage();
      const queueService = configuredQueueService(db);
      const queue = queueFor(queueService);
      const service = new MediaService(testDatabaseService(db), queueService, storage);
      const source = Buffer.from("bounded-media-source");
      const sha256 = digest(source);
      const intent = await service.createUploadIntent(
        fixture.projectId,
        {
          displayName: "office.png",
          claimedContentType: "image/png",
          expectedBytes: source.byteLength,
          expectedSha256: sha256
        },
        fixture.userId
      );

      await service.writeLocalUpload(fixture.projectId, intent.asset.id, source, {
        "x-media-content-type": "image/png",
        "x-media-sha256": sha256
      });
      const completed = await service.completeUpload(fixture.projectId, intent.asset.id);

      assert.equal(completed.asset.status, "processing");
      assert.equal(completed.processing.jobId, intent.asset.id);
      assert.equal(queue.addCalls.length, 1);
      assert.equal(queue.addCalls[0]?.name, "media_processing");
      assert.equal(queue.addCalls[0]?.options.jobId, intent.asset.id);
      assert.equal(queue.addCalls[0]?.data.assetId, intent.asset.id);
      const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, intent.asset.id));
      assert.equal(asset?.status, "processing");
      const [audit] = await db.select().from(jobRuns).where(eq(jobRuns.externalJobId, intent.asset.id));
      assert.equal(audit?.queueName, "media-processing");
      assert.equal(audit?.status, "queued");
    });

    void it("rejects completion when provider metadata differs and leaves the intent pending", async () => {
      const fixture = await createProjectFixture(db, "Mismatch");
      const storage = new MemoryMediaStorage();
      const service = new MediaService(testDatabaseService(db), configuredQueueService(db), storage);
      const source = Buffer.from("bounded-media-source");
      const sha256 = digest(source);
      const intent = await service.createUploadIntent(
        fixture.projectId,
        {
          displayName: "office.png",
          claimedContentType: "image/png",
          expectedBytes: source.byteLength,
          expectedSha256: sha256
        },
        fixture.userId
      );
      storage.objects.set(storage.grants[0]?.key ?? "", {
        body: source,
        contentType: "image/jpeg",
        sha256
      });

      await assert.rejects(() => service.completeUpload(fixture.projectId, intent.asset.id), /metadata/u);
      const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, intent.asset.id));
      assert.equal(asset?.status, "pending_upload");
    });

    void it("keeps media library reads project-scoped", async () => {
      const first = await createProjectFixture(db, "First");
      const second = await createProjectFixture(db, "Second");
      const storage = new MemoryMediaStorage();
      const service = new MediaService(testDatabaseService(db), configuredQueueService(db), storage);
      const sha256 = "d".repeat(64);
      await service.createUploadIntent(
        first.projectId,
        { displayName: "first.png", claimedContentType: "image/png", expectedBytes: 4, expectedSha256: sha256 },
        first.userId
      );
      await service.createUploadIntent(
        second.projectId,
        { displayName: "second.png", claimedContentType: "image/png", expectedBytes: 4, expectedSha256: sha256 },
        second.userId
      );

      const result = await service.listAssets(first.projectId);
      assert.equal(result.assets.length, 1);
      assert.equal(result.assets[0]?.displayName, "first.png");
      assert.equal(result.assets[0]?.projectId, first.projectId);
    });
  }
);

async function createProjectFixture(db: DatabaseClient, name: string) {
  const userId = randomUUID();
  const customerId = randomUUID();
  const projectId = randomUUID();
  await db.insert(users).values({ id: userId, email: `${userId}@example.test`, name });
  await db.insert(customers).values({ id: customerId, ownerUserId: userId, name: `${name} customer` });
  await db.insert(projects).values({ id: projectId, customerId, name: `${name} project`, status: "active" });
  return { userId, projectId };
}

function testDatabaseService(db: DatabaseClient): DatabaseService {
  return { db, isConfigured: () => true, requireDb: () => db } as unknown as DatabaseService;
}

function configuredQueueService(db: DatabaseClient): QueueProducerService {
  const service = new QueueProducerService(testDatabaseService(db));
  (service as unknown as { queues: Record<string, FakeQueue> }).queues["media-processing"] = new FakeQueue();
  return service;
}

function queueFor(service: QueueProducerService): FakeQueue {
  return (service as unknown as { queues: Record<string, FakeQueue> }).queues["media-processing"]!;
}

class FakeQueue {
  readonly addCalls: Array<{ name: string; data: Record<string, unknown>; options: JobsOptions }> = [];

  getJob(): Promise<undefined> {
    return Promise.resolve(undefined);
  }

  add(name: string, data: Record<string, unknown>, options: JobsOptions): Promise<Record<string, unknown>> {
    this.addCalls.push({ name, data, options });
    return Promise.resolve({ id: options.jobId });
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

class MemoryMediaStorage implements MediaAssetStoragePort {
  readonly grants: Array<{
    key: string;
    projectId: string;
    assetId: string;
    contentType: string;
    contentLength: number;
    sha256: string;
    apiPutUrl?: string;
  }> = [];
  readonly objects = new Map<string, { body: Uint8Array; contentType: string; sha256: string }>();

  createUploadGrant(input: (typeof this.grants)[number] & { expiresAt: Date }): Promise<MediaUploadGrant> {
    this.grants.push(input);
    return Promise.resolve({
      kind: "api_put",
      url: input.apiPutUrl ?? "/upload",
      headers: {
        "content-type": "application/octet-stream",
        "x-media-content-type": input.contentType,
        "x-media-sha256": input.sha256
      },
      expiresAt: input.expiresAt.toISOString()
    });
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
      throw new Error("not found");
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

function digest(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
