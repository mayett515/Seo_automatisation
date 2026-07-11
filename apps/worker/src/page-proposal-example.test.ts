import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalPageProposalOutputExample } from "@localseo/ai";
import { PageProposalJsonSchema } from "@localseo/contracts";
import { decidePageStudioPublishReadiness } from "@localseo/domain";
import { pageRegistrySummary, renderPagePreviewFile, validatePageJsonAgainstRegistry } from "@localseo/page-registry";

void test("canonical Page Proposal example remains registry-valid, composition-ready, and previewable", () => {
  const agentRunId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const proposal = PageProposalJsonSchema.parse(
    buildCanonicalPageProposalOutputExample({
      projectId: "11111111-1111-4111-8111-111111111111",
      opportunityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      agentRunId
    })
  );

  const registryValidation = validatePageJsonAgainstRegistry(proposal.page);
  if (!registryValidation.success) {
    assert.fail(registryValidation.issues.map((issue) => issue.code).join(", "));
  }

  const readiness = decidePageStudioPublishReadiness(registryValidation.pageJson, pageRegistrySummary);
  assert.notEqual(readiness.kind, "blocked");
  assert.doesNotThrow(() =>
    renderPagePreviewFile({
      pageJson: registryValidation.pageJson,
      targetUrl: proposal.route,
      mode: "editor",
      previewId: agentRunId
    })
  );
});
