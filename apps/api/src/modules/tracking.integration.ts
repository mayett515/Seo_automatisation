import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { TrackingEvent } from "@localseo/contracts";
import { customers, projectTrackingKeys, projects, trackingEvents, type DatabaseClient } from "@localseo/db";
import { eq } from "drizzle-orm";
import { RedisService } from "../redis/redis.service.js";
import { DatabaseService } from "../database/database.service.js";
import { TrackingRateLimiter, TrackingService } from "./tracking.module.js";
import {
  createIntegrationTestDatabase,
  truncateIntegrationTables
} from "../../../../packages/db/test-support/integration-database.js";

type IntegrationDatabase = Awaited<ReturnType<typeof createIntegrationTestDatabase>>;

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testDatabaseUrl);

void describe(
  "TrackingService database integration",
  { skip: runIntegration ? false : "TEST_DATABASE_URL is not configured" },
  () => {
    let handle: IntegrationDatabase;
    let db: DatabaseClient;
    let limiter: CountingTrackingRateLimiter;
    let service: TrackingService;

    before(async () => {
      assert.ok(testDatabaseUrl);
      handle = await createIntegrationTestDatabase(testDatabaseUrl);
      db = handle.db;
    });

    beforeEach(async () => {
      await truncateIntegrationTables(handle.sql);
      limiter = new CountingTrackingRateLimiter();
      service = new TrackingService(testDatabaseService(db), limiter);
    });

    after(async () => {
      await handle?.close();
    });

    void it("persists accepted events for the project proven by the publishable key", async () => {
      const fixture = await createTrackingFixture(db);
      const key = await service.createKey(fixture.projectId, { allowedOrigins: ["https://customer.example/"] });

      const result = await service.ingest(trackingEvent(fixture.projectId), {
        trackingKey: key.trackingKey,
        origin: "https://customer.example"
      });

      assert.equal(result.accepted, true);
      assert.equal(result.persisted, true);
      assert.equal(result.mode, "persisted");
      assert.equal(limiter.acceptedInputs.length, 1);

      const events = await db.select().from(trackingEvents).where(eq(trackingEvents.projectId, fixture.projectId));
      assert.equal(events.length, 1);
      assert.equal(events[0]?.eventName, "page_view");
      assert.equal(events[0]?.route, "/dachreinigung/");

      const [storedKey] = await db.select().from(projectTrackingKeys).where(eq(projectTrackingKeys.id, key.keyId));
      assert.ok(storedKey?.lastUsedAt);
    });

    void it("rejects revoked keys without writing tracking events", async () => {
      const fixture = await createTrackingFixture(db);
      const key = await service.createKey(fixture.projectId, { allowedOrigins: ["https://customer.example/"] });
      await service.revokeKey(fixture.projectId, key.keyId);

      await assert.rejects(
        service.ingest(trackingEvent(fixture.projectId), {
          trackingKey: key.trackingKey,
          origin: "https://customer.example"
        }),
        /Project tracking key is invalid/u
      );

      assert.equal(limiter.acceptedInputs.length, 0);
      assert.equal(await trackingEventCount(db), 0);
    });

    void it("rejects origin mismatches before rate limit accounting or persistence", async () => {
      const fixture = await createTrackingFixture(db);
      const key = await service.createKey(fixture.projectId, { allowedOrigins: ["https://customer.example/"] });

      await assert.rejects(
        service.ingest(trackingEvent(fixture.projectId), {
          trackingKey: key.trackingKey,
          origin: "https://attacker.example"
        }),
        /not authorized for this origin/u
      );

      assert.equal(limiter.acceptedInputs.length, 0);
      assert.equal(await trackingEventCount(db), 0);
    });

    void it("rejects cross-project key reuse without writing events", async () => {
      const projectA = await createTrackingFixture(db, "Project A");
      const projectB = await createTrackingFixture(db, "Project B");
      const keyA = await service.createKey(projectA.projectId, { allowedOrigins: ["https://customer.example/"] });

      await assert.rejects(
        service.ingest(trackingEvent(projectB.projectId), {
          trackingKey: keyA.trackingKey,
          origin: "https://customer.example"
        }),
        /Project tracking key is invalid/u
      );

      assert.equal(limiter.acceptedInputs.length, 0);
      assert.equal(await trackingEventCount(db), 0);
    });

    void it("coalesces tracking key last-used updates while still persisting accepted events", async () => {
      const fixture = await createTrackingFixture(db);
      const key = await service.createKey(fixture.projectId, { allowedOrigins: ["https://customer.example/"] });

      await service.ingest(trackingEvent(fixture.projectId), {
        trackingKey: key.trackingKey,
        origin: "https://customer.example"
      });
      const [afterFirst] = await db.select().from(projectTrackingKeys).where(eq(projectTrackingKeys.id, key.keyId));
      assert.ok(afterFirst?.lastUsedAt);

      await service.ingest(
        {
          ...trackingEvent(fixture.projectId),
          eventName: "cta_click",
          componentId: "phone-button"
        },
        {
          trackingKey: key.trackingKey,
          origin: "https://customer.example"
        }
      );
      const [afterSecond] = await db.select().from(projectTrackingKeys).where(eq(projectTrackingKeys.id, key.keyId));

      assert.equal(await trackingEventCount(db), 2);
      assert.equal(afterSecond?.lastUsedAt?.getTime(), afterFirst.lastUsedAt.getTime());
      assert.equal(limiter.acceptedInputs.length, 2);
    });
  }
);

async function createTrackingFixture(
  db: DatabaseClient,
  projectName = "Tracking Project"
): Promise<{ projectId: string }> {
  const [customer] = await db
    .insert(customers)
    .values({ name: `${projectName} Customer` })
    .returning();
  assert.ok(customer);
  const [project] = await db
    .insert(projects)
    .values({
      customerId: customer.id,
      name: projectName
    })
    .returning();
  assert.ok(project);

  return { projectId: project.id };
}

function trackingEvent(projectId: string): TrackingEvent {
  return {
    eventName: "page_view",
    projectId,
    pageId: "page-1",
    route: "/dachreinigung/",
    occurredAt: "2026-06-30T12:00:00.000Z"
  };
}

async function trackingEventCount(db: DatabaseClient): Promise<number> {
  return (await db.select().from(trackingEvents)).length;
}

function testDatabaseService(db: DatabaseClient): DatabaseService {
  return {
    get db() {
      return db;
    },
    requireDb: () => db,
    isConfigured: () => true,
    ping: () => Promise.resolve("up"),
    onModuleDestroy: () => Promise.resolve()
  } as unknown as DatabaseService;
}

class CountingTrackingRateLimiter extends TrackingRateLimiter {
  readonly acceptedInputs: Array<{ projectId: string; trackingKeyId: string }> = [];

  constructor() {
    super({ client: undefined } as RedisService);
  }

  override async enforceAcceptedEvent(input: { projectId: string; trackingKeyId: string }): Promise<void> {
    this.acceptedInputs.push(input);
    await super.enforceAcceptedEvent(input);
  }

  protected override shouldFailClosedAcceptedEventLimits(): boolean {
    return false;
  }
}
