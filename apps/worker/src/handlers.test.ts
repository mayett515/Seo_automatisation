import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { GscSearchAnalyticsRow } from "@localseo/contracts";
import { UnrecoverableError, type Job } from "bullmq";
import { DeployConfigurationError, DeployEvidenceError, ManualReconciliationRequiredError } from "./handlers/deploy.js";
import { GscSyncFailureError } from "./handlers/gsc-sync.js";
import { RollbackConfigurationError, RollbackEvidenceError, RollbackProviderFailedError } from "./handlers/rollback.js";
import {
  classifyOpportunitySignals,
  isTerminalWorkerError,
  parseGscSyncJobData,
  routeJob,
  toWorkerRethrowError
} from "./handlers.js";

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
        jobRunId: "job-run-1",
        triggeredByUserId: "user-1",
        triggerSource: "user_action"
      }),
      {
        projectId: "project-1",
        syncRunId: "sync-1",
        jobRunId: "job-run-1",
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

void describe("routeJob", () => {
  void it("routes deploy jobs to the deploy handler instead of returning success metadata", async () => {
    await assert.rejects(
      routeJob({
        id: "deploy-job-1",
        queueName: "deploy",
        name: "deploy",
        data: {
          projectId: "project-1",
          releasePlanId: "release-1",
          deploymentKey: "release_plan:release-1"
        }
      } as Job),
      /DATABASE_URL is required for deploy jobs/u
    );
  });

  void it("routes rollback jobs to the rollback handler instead of returning success metadata", async () => {
    await assert.rejects(
      routeJob({
        id: "rollback-job-1",
        queueName: "rollback",
        name: "rollback",
        data: {
          projectId: "project-1",
          releasePlanId: "release-1",
          deploymentId: "deployment-1",
          rollbackPointId: "rollback-point-1"
        }
      } as Job),
      /DATABASE_URL is required for rollback jobs/u
    );
  });

  void it("fails unknown jobs honestly instead of returning success metadata", async () => {
    await assert.rejects(
      routeJob({
        id: "unknown-job-1",
        queueName: "seo-qa",
        name: "score",
        data: {}
      } as Job),
      /Worker job is not implemented: seo-qa:score/u
    );
  });
});

void describe("isTerminalWorkerError", () => {
  void it("treats deploy configuration and evidence errors as terminal worker failures", () => {
    assert.equal(isTerminalWorkerError(new DeployConfigurationError("missing adapter")), true);
    assert.equal(isTerminalWorkerError(new DeployEvidenceError("not deployable")), true);
    assert.equal(isTerminalWorkerError(new ManualReconciliationRequiredError("manual reconciliation")), true);
    assert.equal(isTerminalWorkerError(new RollbackConfigurationError("missing hosting site")), true);
    assert.equal(isTerminalWorkerError(new RollbackEvidenceError("missing rollback evidence")), true);
    assert.equal(isTerminalWorkerError(new RollbackProviderFailedError("provider failed")), true);
    assert.equal(
      isTerminalWorkerError(new GscSyncFailureError("google_refresh_token_invalid", { reconnectRequired: true })),
      true
    );
    assert.equal(isTerminalWorkerError(new GscSyncFailureError("google_oauth_refresh_failed")), false);
    assert.equal(isTerminalWorkerError(new Error("provider timeout")), false);
  });

  void it("maps terminal worker errors to BullMQ unrecoverable errors", () => {
    const mapped = toWorkerRethrowError(new DeployEvidenceError("not deployable"));

    assert.ok(mapped instanceof UnrecoverableError);
    assert.equal(mapped.message, "not deployable");
    assert.ok(
      toWorkerRethrowError(
        new GscSyncFailureError("refresh_token_decrypt_failed", { reconnectRequired: true })
      ) instanceof UnrecoverableError
    );
    assert.equal(toWorkerRethrowError(new Error("provider timeout")) instanceof UnrecoverableError, false);
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
