import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CreatePageProposalRunRequestSchema, OpportunityExplorerOpportunitySchema } from "./index.js";

void describe("page proposal target revision contracts", () => {
  void it("requires the expected opportunity status and row version", () => {
    const parsed = CreatePageProposalRunRequestSchema.parse({
      opportunityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      expectedOpportunity: {
        status: "monitoring",
        rowVersion: 3
      }
    });

    assert.deepEqual(parsed.expectedOpportunity, { status: "monitoring", rowVersion: 3 });
    assert.equal(
      CreatePageProposalRunRequestSchema.safeParse({
        opportunityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      }).success,
      false
    );
  });

  void it("rejects unknown target fields and invalid revisions", () => {
    assert.equal(
      CreatePageProposalRunRequestSchema.safeParse({
        opportunityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        expectedOpportunity: {
          status: "new",
          rowVersion: -1,
          updatedAt: "2026-08-03T10:00:00.000Z"
        }
      }).success,
      false
    );
  });

  void it("exposes the durable opportunity row version to clients", () => {
    const parsed = OpportunityExplorerOpportunitySchema.parse({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      projectId: "11111111-1111-4111-8111-111111111111",
      classification: "near_term_target",
      primaryKeyword: "dachreinigung muenchen",
      score: 72,
      status: "new",
      rowVersion: 0,
      evidenceJson: null,
      createdAt: "2026-08-03T10:00:00.000Z",
      updatedAt: "2026-08-03T10:00:00.000Z"
    });

    assert.equal(parsed.rowVersion, 0);
  });
});
