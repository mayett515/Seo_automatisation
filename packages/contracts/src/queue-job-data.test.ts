import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DeployJobDataSchema,
  OpportunityScoutJobDataSchema,
  RollbackJobDataSchema,
  WebsiteImportJobDataSchema
} from "./index.js";

void describe("queue job data contracts", () => {
  void it("rejects unknown extra keys on strict job payloads", () => {
    const cases = [
      [DeployJobDataSchema, { projectId: "project-1", releasePlanId: "plan-1", deploymentKey: "deploy-1" }],
      [
        RollbackJobDataSchema,
        { projectId: "project-1", releasePlanId: "plan-1", deploymentId: "deployment-1", rollbackPointId: "rollback-1" }
      ],
      [WebsiteImportJobDataSchema, { projectId: "project-1", importRunId: "run-1", sourceUrl: "https://example.com" }],
      [OpportunityScoutJobDataSchema, { projectId: "project-1", runId: "scout-1" }]
    ] as const;

    for (const [schema, base] of cases) {
      assert.equal(schema.safeParse({ ...base, unexpectedKey: true }).success, false);
      assert.equal(schema.safeParse(base).success, true);
    }
  });
});
