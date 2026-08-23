import { eq } from "drizzle-orm";
import { pageProposals, pageVersions } from "./schema.js";

export function pageVersionProjectScope(projectId: string) {
  return {
    joinCondition: eq(pageVersions.pageProposalId, pageProposals.id),
    projectCondition: eq(pageProposals.projectId, projectId)
  };
}
