import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { UnauthorizedException } from "@nestjs/common";
import { assertTrackingIngestAllowed } from "./tracking.module.js";

void describe("tracking ingestion authorization", () => {
  void it("allows demo project events without an ingestion token", () => {
    assert.doesNotThrow(() =>
      assertTrackingIngestAllowed(
        {
          eventName: "page_view",
          projectId: "demo-project",
          route: "/"
        },
        undefined
      )
    );
  });

  void it("rejects persisted project events when no ingestion token is configured", () => {
    assert.throws(
      () =>
        assertTrackingIngestAllowed(
          {
            eventName: "page_view",
            projectId: "11111111-1111-4111-8111-111111111111",
            route: "/"
          },
          undefined
        ),
      (error) => error instanceof UnauthorizedException
    );
  });
});
