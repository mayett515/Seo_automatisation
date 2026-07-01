import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, HttpException } from "@nestjs/common";
import { CreateTrackingKeyRequestSchema } from "@localseo/contracts";
import type { DatabaseService } from "../database/database.service.js";
import type { RedisService } from "../redis/redis.service.js";
import {
  hashTrackingKey,
  isLocalScaffoldEvent,
  isTrackingOriginAllowed,
  originFromTrackingHeaders,
  trackingRateLimitKeys,
  TrackingRateLimiter,
  TrackingService
} from "./tracking.module.js";

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
      const service = new TrackingService(
        { db: undefined } as DatabaseService,
        new TrackingRateLimiter({ client: undefined } as RedisService)
      );

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

  void it("normalizes tracking origins from Origin before Referer", () => {
    assert.equal(
      originFromTrackingHeaders({
        origin: "https://example.test/some/path",
        referer: "https://referer.test/page"
      }),
      "https://example.test"
    );
  });

  void it("falls back to Referer when Origin is missing", () => {
    assert.equal(
      originFromTrackingHeaders({
        referer: "https://example.test/page?utm=test"
      }),
      "https://example.test"
    );
  });

  void it("rejects tracking requests outside the key origin allowlist", () => {
    assert.equal(isTrackingOriginAllowed("https://example.test/path", ["https://example.test"]), true);
    assert.equal(isTrackingOriginAllowed("https://evil.test", ["https://example.test"]), false);
    assert.equal(isTrackingOriginAllowed("https://example.test", []), false);
  });

  void it("accepts only http and https tracking key origins", () => {
    assert.deepEqual(CreateTrackingKeyRequestSchema.parse({ allowedOrigins: ["https://example.test/path"] }), {
      allowedOrigins: ["https://example.test"]
    });
    assert.throws(() => CreateTrackingKeyRequestSchema.parse({ allowedOrigins: ["ftp://example.test"] }));
  });

  void it("uses global project and key tracking rate-limit buckets after validation", () => {
    assert.deepEqual(
      trackingRateLimitKeys({
        ip: "203.0.113.10",
        projectId: "11111111-1111-4111-8111-111111111111",
        trackingKeyId: "22222222-2222-4222-8222-222222222222"
      }),
      {
        ip: "track:ip:203.0.113.10",
        ipProject: "track:ip-project:203.0.113.10:11111111-1111-4111-8111-111111111111",
        project: "track:project:11111111-1111-4111-8111-111111111111",
        trackingKey: "track:key:22222222-2222-4222-8222-222222222222",
        trackingKeyProject:
          "track:key-project:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222"
      }
    );
  });

  void it("coalesces tracking key last-used flushes in memory", async () => {
    const limiter = new TrackingRateLimiter({ client: undefined } as RedisService);

    assert.equal(await limiter.shouldFlushTrackingKeyLastUsedAt("key-1"), true);
    assert.equal(await limiter.shouldFlushTrackingKeyLastUsedAt("key-1"), false);
    assert.equal(await limiter.shouldFlushTrackingKeyLastUsedAt("key-2"), true);
  });

  void it("fails accepted event limits closed when strict mode has no Redis client", async () => {
    const limiter = new StrictTrackingRateLimiter({ client: undefined } as RedisService);

    await assert.rejects(
      limiter.enforceAcceptedEvent({
        projectId: "11111111-1111-4111-8111-111111111111",
        trackingKeyId: "22222222-2222-4222-8222-222222222222"
      }),
      isServiceUnavailableRateLimit
    );
  });

  void it("fails accepted event limits closed when Redis increment fails", async () => {
    const limiter = new StrictTrackingRateLimiter(failingRedisService());

    await assert.rejects(
      limiter.enforceAcceptedEvent({
        projectId: "11111111-1111-4111-8111-111111111111",
        trackingKeyId: "22222222-2222-4222-8222-222222222222"
      }),
      isServiceUnavailableRateLimit
    );
  });

  void it("uses one Redis script for rate-limit increment and TTL creation", async () => {
    const evalCalls: unknown[][] = [];
    const limiter = new TrackingRateLimiter({
      client: {
        eval: (...args: unknown[]) => {
          evalCalls.push(args);
          return Promise.resolve(evalCalls.length);
        }
      }
    } as unknown as RedisService);

    await limiter.enforcePreValidationRequest({
      ip: "203.0.113.10",
      projectId: "11111111-1111-4111-8111-111111111111"
    });

    assert.equal(evalCalls.length, 2);
    assert.match(String(evalCalls[0]?.[0]), /EXPIRE/u);
    assert.deepEqual(evalCalls[0]?.slice(1), [1, "tracking:rate-limit:track:ip:203.0.113.10", "60"]);
  });

  void it("keeps pre-validation limits as a soft local throttle when Redis fails", async () => {
    const limiter = new StrictTrackingRateLimiter(failingRedisService());

    await limiter.enforcePreValidationRequest({
      ip: "203.0.113.10",
      projectId: "11111111-1111-4111-8111-111111111111"
    });
  });
});

class StrictTrackingRateLimiter extends TrackingRateLimiter {
  protected override shouldFailClosedAcceptedEventLimits(): boolean {
    return true;
  }
}

function failingRedisService(): RedisService {
  return {
    client: {
      eval: () => Promise.reject(new Error("redis down"))
    }
  } as unknown as RedisService;
}

function isServiceUnavailableRateLimit(error: unknown): boolean {
  return (
    error instanceof HttpException &&
    error.getStatus() === 503 &&
    error.message === "Tracking rate limit temporarily unavailable."
  );
}

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
