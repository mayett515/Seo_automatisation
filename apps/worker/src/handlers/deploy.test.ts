import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SiteHostingPort } from "@localseo/adapters";
import type { DeployJobData, ReleaseCheck } from "@localseo/contracts";
import { buildReleaseDeploymentKey } from "@localseo/domain";
import {
  buildReleaseArtifactKey,
  executeDeploy,
  parseDeployJobData,
  type DeployContext,
  type DeployRepository,
  type DeploymentRow,
  type ReleasePlanRow
} from "./deploy.js";

void describe("parseDeployJobData", () => {
  void it("accepts deploy jobs with a stable deployment key", () => {
    const releasePlanId = "release-1";

    assert.deepEqual(
      parseDeployJobData({
        projectId: "project-1",
        releasePlanId,
        deploymentKey: buildReleaseDeploymentKey(releasePlanId),
        triggeredByUserId: "user-1",
        triggerSource: "user_action"
      }),
      {
        projectId: "project-1",
        releasePlanId,
        deploymentKey: buildReleaseDeploymentKey(releasePlanId),
        triggeredByUserId: "user-1",
        triggerSource: "user_action"
      }
    );
  });

  void it("rejects deployment keys that do not match the release plan", () => {
    assert.throws(
      () =>
        parseDeployJobData({
          projectId: "project-1",
          releasePlanId: "release-1",
          deploymentKey: "release_plan:other-release"
        }),
      /deploymentKey does not match releasePlanId/u
    );
  });
});

void describe("executeDeploy", () => {
  void it("creates a deployment ledger row and persists provider success", async () => {
    const data = deployJobData();
    const repository = createRepository();
    const result = await executeDeploy({
      data,
      jobId: data.deploymentKey,
      repository,
      siteHosting: createSiteHosting({
        status: "ready",
        providerDeployId: "provider-deploy-1",
        liveUrls: ["https://example.test/"]
      })
    });

    assert.equal(result.status, "provider_succeeded");
    assert.equal(result.providerDeployId, "provider-deploy-1");
    assert.equal(repository.started.length, 1);
    assert.equal(repository.providerSucceeded.length, 1);
    assert.equal(repository.failed.length, 0);
  });

  void it("marks deployment and release failed when hosting is not configured", async () => {
    const data = deployJobData();
    const repository = createRepository();

    await assert.rejects(
      executeDeploy({
        data,
        jobId: data.deploymentKey,
        repository,
        siteHosting: createSiteHosting({
          status: "not_configured",
          message: "Site hosting is not configured.",
          liveUrls: []
        })
      }),
      /Site hosting is not configured/u
    );

    assert.equal(repository.started.length, 1);
    assert.equal(repository.providerSucceeded.length, 0);
    assert.equal(repository.failed.length, 1);
  });

  void it("keeps transient provider failures retriable before the final attempt", async () => {
    const data = deployJobData();
    const repository = createRepository();

    await assert.rejects(
      executeDeploy({
        data,
        isFinalAttempt: false,
        jobId: data.deploymentKey,
        repository,
        siteHosting: createSiteHosting(new Error("provider timeout"))
      }),
      /provider timeout/u
    );

    assert.equal(repository.started.length, 1);
    assert.equal(repository.providerSucceeded.length, 0);
    assert.equal(repository.failed.length, 0);
  });

  void it("marks transient provider failures failed on the final attempt", async () => {
    const data = deployJobData();
    const repository = createRepository();

    await assert.rejects(
      executeDeploy({
        data,
        isFinalAttempt: true,
        jobId: data.deploymentKey,
        repository,
        siteHosting: createSiteHosting(new Error("provider timeout"))
      }),
      /provider timeout/u
    );

    assert.equal(repository.started.length, 1);
    assert.equal(repository.providerSucceeded.length, 0);
    assert.equal(repository.failed.length, 1);
  });

  void it("replays an already successful deployment without creating another provider deploy", async () => {
    const data = deployJobData();
    const repository = createRepository(
      deployContext({
        existingDeployment: deploymentRow({
          status: "provider_succeeded",
          providerDeployId: "provider-deploy-1"
        })
      })
    );
    const result = await executeDeploy({
      data,
      jobId: data.deploymentKey,
      repository,
      siteHosting: createSiteHosting(new Error("provider should not be called"))
    });

    assert.equal(result.status, "already_deployed");
    assert.equal(repository.started.length, 0);
    assert.equal(repository.releaseLiveCount, 1);
  });

  void it("reconciles an existing provider deploy before creating another deploy", async () => {
    const data = deployJobData();
    const repository = createRepository(
      deployContext({
        existingDeployment: deploymentRow({
          status: "deploying",
          providerDeployId: "provider-deploy-1"
        })
      })
    );
    const result = await executeDeploy({
      data,
      jobId: data.deploymentKey,
      repository,
      siteHosting: createSiteHosting(new Error("provider should not create another deploy"), {
        providerDeployId: "provider-deploy-1",
        status: "ready",
        liveUrls: ["https://example.test/"]
      })
    });

    assert.equal(result.status, "provider_succeeded");
    assert.equal(result.reconciled, true);
    assert.equal(repository.started.length, 0);
    assert.equal(repository.providerSucceeded.length, 1);
  });

  void it("keeps an existing provider deploy in progress instead of marking release failed", async () => {
    const data = deployJobData();
    const repository = createRepository(
      deployContext({
        existingDeployment: deploymentRow({
          status: "deploying",
          providerDeployId: "provider-deploy-1"
        })
      })
    );

    await assert.rejects(
      executeDeploy({
        data,
        isFinalAttempt: false,
        jobId: data.deploymentKey,
        repository,
        siteHosting: createSiteHosting(new Error("provider should not create another deploy"), {
          providerDeployId: "provider-deploy-1",
          status: "deploying",
          liveUrls: []
        })
      }),
      /Provider deploy is still deploying/u
    );

    assert.equal(repository.started.length, 0);
    assert.equal(repository.providerSucceeded.length, 0);
    assert.equal(repository.failed.length, 0);
  });

  void it("marks pending provider deploys failed after the final attempt", async () => {
    const data = deployJobData();
    const repository = createRepository(
      deployContext({
        existingDeployment: deploymentRow({
          status: "deploying",
          providerDeployId: "provider-deploy-1"
        })
      })
    );

    await assert.rejects(
      executeDeploy({
        data,
        isFinalAttempt: true,
        jobId: data.deploymentKey,
        repository,
        siteHosting: createSiteHosting(new Error("provider should not create another deploy"), {
          providerDeployId: "provider-deploy-1",
          status: "deploying",
          liveUrls: []
        })
      }),
      /Provider deploy is still deploying/u
    );

    assert.equal(repository.started.length, 0);
    assert.equal(repository.providerSucceeded.length, 0);
    assert.equal(repository.failed.length, 1);
  });

  void it("fails when persisted worker evidence is no longer deployable", async () => {
    const data = deployJobData();
    const repository = createRepository(
      deployContext({
        checks: [releaseCheck({ severity: "blocker", result: "failed" })]
      })
    );

    await assert.rejects(
      executeDeploy({
        data,
        jobId: data.deploymentKey,
        repository,
        siteHosting: createSiteHosting(new Error("provider should not be called"))
      }),
      /Release is not deployable/u
    );

    assert.equal(repository.started.length, 0);
    assert.equal(repository.failed.length, 1);
  });

  void it("replays a deployment row that became successful during start without creating another provider deploy", async () => {
    const data = deployJobData();
    const repository = createRepository(deployContext(), {
      startDeploymentResult: deploymentRow({
        status: "provider_succeeded",
        providerDeployId: "provider-deploy-1"
      })
    });

    const result = await executeDeploy({
      data,
      jobId: data.deploymentKey,
      repository,
      siteHosting: createSiteHosting(new Error("provider should not be called"))
    });

    assert.equal(result.status, "already_deployed");
    assert.equal(repository.started.length, 1);
    assert.equal(repository.providerSucceeded.length, 0);
    assert.equal(repository.releaseLiveCount, 1);
  });
});

void describe("buildReleaseArtifactKey", () => {
  void it("uses a deterministic artifact key for the approved release artifact", () => {
    assert.equal(buildReleaseArtifactKey("release-1"), "releases/release-1/approved-artifact.json");
  });
});

function deployJobData(input: Partial<DeployJobData> = {}): DeployJobData {
  const releasePlanId = input.releasePlanId ?? "release-1";

  return {
    projectId: "project-1",
    releasePlanId,
    deploymentKey: buildReleaseDeploymentKey(releasePlanId),
    ...input
  };
}

function deployContext(input: Partial<DeployContext> = {}): DeployContext {
  return {
    plan: releasePlanRow(),
    checks: [releaseCheck({ severity: "blocker", result: "passed" })],
    hasApproval: true,
    releaseItemCount: 1,
    rollbackPointCount: 1,
    ...input
  };
}

function releasePlanRow(input: Partial<ReleasePlanRow> = {}): ReleasePlanRow {
  const now = new Date("2026-06-29T00:00:00.000Z");

  return {
    id: "release-1",
    projectId: "project-1",
    createdByAgentId: null,
    status: "approved_for_deploy",
    summary: "Release plan",
    riskLevel: "low",
    blockerCount: 0,
    warningCount: 0,
    approvedAt: now,
    deployedAt: null,
    createdAt: now,
    updatedAt: now,
    ...input
  };
}

function deploymentRow(input: Partial<DeploymentRow> = {}): DeploymentRow {
  const now = new Date("2026-06-29T00:00:00.000Z");

  return {
    id: "deployment-1",
    projectId: "project-1",
    releasePlanId: "release-1",
    deploymentKey: buildReleaseDeploymentKey("release-1"),
    provider: "netlify",
    providerDeployId: null,
    liveUrl: null,
    status: "deploying",
    verificationStatus: "not_started",
    verifiedAt: null,
    evidenceJson: null,
    createdAt: now,
    updatedAt: now,
    ...input
  };
}

function releaseCheck(input: Pick<ReleaseCheck, "severity" | "result">): ReleaseCheck {
  return {
    checkKey: `${input.severity}-${input.result}`,
    scope: "project",
    severity: input.severity,
    result: input.result,
    message: "test check"
  };
}

function createRepository(
  context: DeployContext = deployContext(),
  options: { startDeploymentResult?: DeploymentRow } = {}
): DeployRepository & {
  started: unknown[];
  providerSucceeded: unknown[];
  failed: unknown[];
  readonly releaseLiveCount: number;
} {
  const calls = {
    started: [] as unknown[],
    providerSucceeded: [] as unknown[],
    failed: [] as unknown[],
    releaseLiveCount: 0
  };

  return {
    started: calls.started,
    providerSucceeded: calls.providerSucceeded,
    failed: calls.failed,
    get releaseLiveCount() {
      return calls.releaseLiveCount;
    },
    loadContext: () => Promise.resolve(context),
    startDeployment: (input) => {
      calls.started.push(input);
      return Promise.resolve(options.startDeploymentResult ?? deploymentRow());
    },
    markProviderSucceeded: (input) => {
      calls.providerSucceeded.push(input);
      return Promise.resolve(
        deploymentRow({
          status: "provider_succeeded",
          providerDeployId: input.result.providerDeployId,
          liveUrl: input.result.liveUrls[0] ?? null
        })
      );
    },
    markReleaseLive: () => {
      calls.releaseLiveCount += 1;
      return Promise.resolve();
    },
    markFailed: (_data, error) => {
      calls.failed.push(error);
      return Promise.resolve();
    }
  };
}

function createSiteHosting(
  result: Awaited<ReturnType<SiteHostingPort["createDeploy"]>> | Error,
  snapshot: Awaited<ReturnType<SiteHostingPort["getDeploy"]>> = {
    providerDeployId: "provider-deploy-1",
    status: "unknown",
    liveUrls: []
  }
): SiteHostingPort {
  return {
    createDeploy: () => {
      if (result instanceof Error) {
        return Promise.reject(result);
      }

      return Promise.resolve(result);
    },
    getDeploy: () => Promise.resolve(snapshot),
    restoreDeploy: () =>
      Promise.resolve({
        artifactKey: "rollback/release-1/previous-stable.json"
      }),
    rollbackDeploy: () =>
      Promise.resolve({
        status: "failed"
      })
  };
}
