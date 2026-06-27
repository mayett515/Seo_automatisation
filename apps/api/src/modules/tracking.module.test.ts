import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hashTrackingKey, isLocalScaffoldEvent } from "./tracking.module.js";

void describe("tracking ingestion authorization", () => {
  void it("treats demo project events as local dry-run outside production", () => {
    assert.equal(
      isLocalScaffoldEvent({
        eventName: "page_view",
        projectId: "demo-project",
        route: "/"
      }),
      true
    );
  });

  void it("does not allow demo project tracking as local dry-run in production", () => {
    withNodeEnv("production", () => {
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

  void it("does not treat persisted project events as local dry-run", () => {
    assert.equal(
      isLocalScaffoldEvent({
        eventName: "page_view",
        projectId: "11111111-1111-4111-8111-111111111111",
        route: "/"
      }),
      false
    );
  });

  void it("hashes publishable tracking keys deterministically", () => {
    assert.equal(hashTrackingKey("pk_project_123"), hashTrackingKey("pk_project_123"));
    assert.notEqual(hashTrackingKey("pk_project_123"), hashTrackingKey("pk_project_456"));
  });
});

function withNodeEnv<T>(nodeEnv: string, run: () => T): T {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;

  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previous;
    }
  }
}
