import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import type { DatabaseService } from "../database/database.service.js";
import { hashTrackingKey, isLocalScaffoldEvent, TrackingService } from "./tracking.module.js";

void describe("tracking ingestion authorization", () => {
  void it("does not treat demo project events as local dry-run by default", async () => {
    await withEnv({ NODE_ENV: "development", ALLOW_LOCAL_SCAFFOLD_AUTH: undefined }, () => {
      assert.equal(
        isLocalScaffoldEvent({
          eventName: "page_view",
          projectId: "demo-project",
          route: "/"
        }),
        false
      );
    });
  });

  void it("treats demo project events as local dry-run when local scaffold auth is enabled", async () => {
    await withEnv({ NODE_ENV: "development", ALLOW_LOCAL_SCAFFOLD_AUTH: "true" }, () => {
      assert.equal(
        isLocalScaffoldEvent({
          eventName: "page_view",
          projectId: "demo-project",
          route: "/"
        }),
        true
      );
    });
  });

  void it("does not allow demo project tracking as local dry-run in production", async () => {
    await withEnv({ NODE_ENV: "production", ALLOW_LOCAL_SCAFFOLD_AUTH: "true" }, () => {
      assert.equal(
        isLocalScaffoldEvent({
          eventName: "page_view",
          projectId: "demo-project",
          route: "/"
        }),
        false
      );
    });
  });

  void it("does not treat persisted project events as local dry-run", async () => {
    await withEnv({ NODE_ENV: "development", ALLOW_LOCAL_SCAFFOLD_AUTH: "true" }, () => {
      assert.equal(
        isLocalScaffoldEvent({
          eventName: "page_view",
          projectId: "11111111-1111-4111-8111-111111111111",
          route: "/"
        }),
        false
      );
    });
  });

  void it("rejects non-UUID persisted project ids before persistence lookup", async () => {
    await withEnv({ NODE_ENV: "development", ALLOW_LOCAL_SCAFFOLD_AUTH: undefined }, async () => {
      const service = new TrackingService({ db: undefined } as DatabaseService);

      await assert.rejects(
        service.ingest({
          eventName: "page_view",
          projectId: "not-a-uuid",
          route: "/"
        }),
        (error) => error instanceof BadRequestException
      );
    });
  });

  void it("hashes publishable tracking keys deterministically", () => {
    assert.equal(hashTrackingKey("pk_project_123"), hashTrackingKey("pk_project_123"));
    assert.notEqual(hashTrackingKey("pk_project_123"), hashTrackingKey("pk_project_456"));
  });
});

async function withEnv<T>(updates: Record<string, string | undefined>, run: () => T | Promise<T>): Promise<T> {
  const previous = new Map(Object.keys(updates).map((key) => [key, process.env[key]]));

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
