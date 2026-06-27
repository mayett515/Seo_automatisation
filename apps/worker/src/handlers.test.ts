import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { GscSearchAnalyticsRow } from "@localseo/contracts";
import { classifyOpportunitySignals, parseGscSyncJobData } from "./handlers.js";

void describe("parseGscSyncJobData", () => {
  void it("accepts valid GSC sync job data", () => {
    assert.deepEqual(
      parseGscSyncJobData({
        projectId: "project-1",
        syncRunId: "sync-1"
      }),
      {
        projectId: "project-1",
        syncRunId: "sync-1"
      }
    );
  });

  void it("preserves optional actor metadata", () => {
    assert.deepEqual(
      parseGscSyncJobData({
        projectId: "project-1",
        syncRunId: "sync-1",
        triggeredByUserId: "user-1",
        triggerSource: "user_action"
      }),
      {
        projectId: "project-1",
        syncRunId: "sync-1",
        triggeredByUserId: "user-1",
        triggerSource: "user_action"
      }
    );
  });

  void it("rejects missing sync identifiers", () => {
    assert.throws(() => parseGscSyncJobData({ projectId: "project-1" }), /requires projectId and syncRunId/u);
  });
});

void describe("classifyOpportunitySignals", () => {
  void it("flags impression/no-click and page-two opportunity signals", () => {
    assert.deepEqual(
      classifyOpportunitySignals(
        row({
          clicks: 0,
          impressions: 12,
          pageUrl: "https://example.test/dachreinigung-dachau/",
          position: 17
        })
      ),
      ["impressions_no_clicks", "positions_11_100", "service_location_query"]
    );
  });

  void it("flags wrong-page service-location matches after German normalization", () => {
    assert.deepEqual(
      classifyOpportunitySignals(
        row({
          query: "Entrümpelung Dachau",
          pageUrl: "https://example.test/entruempelung-muenchen/",
          clicks: 1,
          impressions: 30,
          position: 8
        })
      ),
      ["service_location_query", "wrong_page_service_location"]
    );
  });
});

function row(input: Partial<GscSearchAnalyticsRow>): GscSearchAnalyticsRow {
  return {
    projectId: "project-1",
    propertyUrl: "https://example.test/",
    query: "dachreinigung dachau",
    pageUrl: "https://example.test/dachreinigung/",
    clicks: 0,
    impressions: 0,
    ctr: 0,
    position: 1,
    ...input
  };
}
