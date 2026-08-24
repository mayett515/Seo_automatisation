import { relations } from "drizzle-orm";
import { accounts, customerMemberships, customers, sessions, users } from "./identity.js";
import {
  agentRunEvidenceItems,
  agentRunEvents,
  agentRuns,
  agentRunSteps,
  agentRunStepEvidenceLinks,
  opportunities,
  projectKnowledgeDocuments,
  projectKnowledgeLinks,
  projectKnowledgeTaskScopes,
  projectKnowledgeVersions,
  projectOpportunityResearchStates,
  publicWebSearchCaptures,
  rankingProofs
} from "./opportunities.js";
import { mainWebsites, projectBusinessProfileRevisions, projectTrackingKeys, projects } from "./projects.js";
import {
  mediaAssets,
  mediaAssetVariants,
  pageProposals,
  pageSectionCopySuggestions,
  pageSectionNotes,
  pageVersionMediaAssets,
  pageVersions
} from "./pages.js";
import {
  deployments,
  releaseChecks,
  releaseNotes,
  releasePlanItems,
  releasePlans,
  releaseVerificationChecks,
  releaseVerifications,
  rollbackPoints
} from "./releases.js";
import { gscConnections, gscOpportunitySignals, gscSearchAnalyticsRows, gscSyncRuns } from "./gsc.js";
import {
  reportArtifacts,
  reportClaims,
  reportEvidenceItems,
  reportGenerationRuns,
  reportIssues,
  reports
} from "./reports.js";
import { technicalAuditFindings, technicalAuditRuns, websiteImportRuns } from "./website-import.js";
export const projectRelations = relations(projects, ({ many, one }) => ({
  customer: one(customers, { fields: [projects.customerId], references: [customers.id] }),
  opportunities: many(opportunities),
  pageProposals: many(pageProposals),
  releasePlans: many(releasePlans),
  deployments: many(deployments),
  gscConnections: many(gscConnections),
  gscSyncRuns: many(gscSyncRuns),
  gscOpportunitySignals: many(gscOpportunitySignals),
  websiteImportRuns: many(websiteImportRuns),
  technicalAuditRuns: many(technicalAuditRuns),
  technicalAuditFindings: many(technicalAuditFindings),
  agentRuns: many(agentRuns),
  rankingProofs: many(rankingProofs),
  trackingKeys: many(projectTrackingKeys),
  reports: many(reports),
  mediaAssets: many(mediaAssets),
  businessProfileRevisions: many(projectBusinessProfileRevisions),
  knowledgeDocuments: many(projectKnowledgeDocuments),
  publicWebSearchCaptures: many(publicWebSearchCaptures),
  opportunityResearchStates: many(projectOpportunityResearchStates)
}));

export const mainWebsiteRelations = relations(mainWebsites, ({ many, one }) => ({
  project: one(projects, { fields: [mainWebsites.projectId], references: [projects.id] }),
  importRuns: many(websiteImportRuns)
}));

export const websiteImportRunRelations = relations(websiteImportRuns, ({ one }) => ({
  project: one(projects, { fields: [websiteImportRuns.projectId], references: [projects.id] }),
  mainWebsite: one(mainWebsites, { fields: [websiteImportRuns.mainWebsiteId], references: [mainWebsites.id] })
}));

export const technicalAuditRunRelations = relations(technicalAuditRuns, ({ many, one }) => ({
  project: one(projects, { fields: [technicalAuditRuns.projectId], references: [projects.id] }),
  findings: many(technicalAuditFindings)
}));

export const technicalAuditFindingRelations = relations(technicalAuditFindings, ({ one }) => ({
  project: one(projects, { fields: [technicalAuditFindings.projectId], references: [projects.id] }),
  auditRun: one(technicalAuditRuns, {
    fields: [technicalAuditFindings.auditRunId],
    references: [technicalAuditRuns.id]
  })
}));

export const userRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  ownedCustomers: many(customers),
  memberships: many(customerMemberships),
  createdMediaAssets: many(mediaAssets, { relationName: "mediaAssetCreator" }),
  archivedMediaAssets: many(mediaAssets, { relationName: "mediaAssetArchiver" })
}));

export const sessionRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] })
}));

export const accountRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] })
}));

export const customerRelations = relations(customers, ({ many, one }) => ({
  owner: one(users, { fields: [customers.ownerUserId], references: [users.id] }),
  memberships: many(customerMemberships),
  projects: many(projects)
}));

export const customerMembershipRelations = relations(customerMemberships, ({ one }) => ({
  customer: one(customers, { fields: [customerMemberships.customerId], references: [customers.id] }),
  user: one(users, { fields: [customerMemberships.userId], references: [users.id] })
}));

export const pageProposalRelations = relations(pageProposals, ({ many, one }) => ({
  project: one(projects, { fields: [pageProposals.projectId], references: [projects.id] }),
  versions: many(pageVersions)
}));

export const pageVersionRelations = relations(pageVersions, ({ many, one }) => ({
  proposal: one(pageProposals, { fields: [pageVersions.pageProposalId], references: [pageProposals.id] }),
  basedOn: one(pageVersions, {
    fields: [pageVersions.basedOnVersionId],
    references: [pageVersions.id],
    relationName: "pageVersionLineage"
  }),
  derivedVersions: many(pageVersions, { relationName: "pageVersionLineage" }),
  createdBy: one(users, { fields: [pageVersions.createdByUserId], references: [users.id] }),
  sectionNotes: many(pageSectionNotes),
  copySuggestions: many(pageSectionCopySuggestions, { relationName: "copySuggestionBaseVersion" }),
  appliedCopySuggestions: many(pageSectionCopySuggestions, { relationName: "copySuggestionAppliedVersion" }),
  mediaAssets: many(pageVersionMediaAssets)
}));

export const mediaAssetRelations = relations(mediaAssets, ({ many, one }) => ({
  project: one(projects, { fields: [mediaAssets.projectId], references: [projects.id] }),
  createdBy: one(users, {
    fields: [mediaAssets.createdByUserId],
    references: [users.id],
    relationName: "mediaAssetCreator"
  }),
  archivedBy: one(users, {
    fields: [mediaAssets.archivedByUserId],
    references: [users.id],
    relationName: "mediaAssetArchiver"
  }),
  variants: many(mediaAssetVariants),
  pageVersions: many(pageVersionMediaAssets)
}));

export const mediaAssetVariantRelations = relations(mediaAssetVariants, ({ one }) => ({
  mediaAsset: one(mediaAssets, {
    fields: [mediaAssetVariants.mediaAssetId],
    references: [mediaAssets.id]
  })
}));

export const pageVersionMediaAssetRelations = relations(pageVersionMediaAssets, ({ one }) => ({
  pageVersion: one(pageVersions, {
    fields: [pageVersionMediaAssets.pageVersionId],
    references: [pageVersions.id]
  }),
  mediaAsset: one(mediaAssets, {
    fields: [pageVersionMediaAssets.mediaAssetId],
    references: [mediaAssets.id]
  })
}));

export const pageSectionCopySuggestionRelations = relations(pageSectionCopySuggestions, ({ one }) => ({
  pageVersion: one(pageVersions, {
    fields: [pageSectionCopySuggestions.pageVersionId],
    references: [pageVersions.id],
    relationName: "copySuggestionBaseVersion"
  }),
  appliedPageVersion: one(pageVersions, {
    fields: [pageSectionCopySuggestions.appliedPageVersionId],
    references: [pageVersions.id],
    relationName: "copySuggestionAppliedVersion"
  }),
  agentRun: one(agentRuns, {
    fields: [pageSectionCopySuggestions.agentRunId],
    references: [agentRuns.id]
  })
}));

export const pageSectionNoteRelations = relations(pageSectionNotes, ({ one }) => ({
  pageVersion: one(pageVersions, { fields: [pageSectionNotes.pageVersionId], references: [pageVersions.id] }),
  createdBy: one(users, { fields: [pageSectionNotes.createdByUserId], references: [users.id] }),
  resolvedBy: one(users, { fields: [pageSectionNotes.resolvedByUserId], references: [users.id] })
}));

export const agentRunRelations = relations(agentRuns, ({ many, one }) => ({
  project: one(projects, { fields: [agentRuns.projectId], references: [projects.id] }),
  opportunities: many(opportunities),
  pageSectionCopySuggestions: many(pageSectionCopySuggestions),
  steps: many(agentRunSteps),
  events: many(agentRunEvents),
  evidenceItems: many(agentRunEvidenceItems),
  publicWebSearchCaptures: many(publicWebSearchCaptures)
}));

export const agentRunStepRelations = relations(agentRunSteps, ({ many, one }) => ({
  run: one(agentRuns, { fields: [agentRunSteps.agentRunId], references: [agentRuns.id] }),
  events: many(agentRunEvents),
  evidenceLinks: many(agentRunStepEvidenceLinks)
}));

export const agentRunEvidenceItemRelations = relations(agentRunEvidenceItems, ({ many, one }) => ({
  run: one(agentRuns, { fields: [agentRunEvidenceItems.agentRunId], references: [agentRuns.id] }),
  stepLinks: many(agentRunStepEvidenceLinks)
}));

export const projectKnowledgeDocumentRelations = relations(projectKnowledgeDocuments, ({ many, one }) => ({
  project: one(projects, { fields: [projectKnowledgeDocuments.projectId], references: [projects.id] }),
  versions: many(projectKnowledgeVersions)
}));

export const projectKnowledgeVersionRelations = relations(projectKnowledgeVersions, ({ many, one }) => ({
  document: one(projectKnowledgeDocuments, {
    fields: [projectKnowledgeVersions.documentId],
    references: [projectKnowledgeDocuments.id]
  }),
  scopes: many(projectKnowledgeTaskScopes),
  outgoingLinks: many(projectKnowledgeLinks, { relationName: "knowledgeLinkFrom" }),
  incomingLinks: many(projectKnowledgeLinks, { relationName: "knowledgeLinkTo" })
}));

export const opportunityRelations = relations(opportunities, ({ many, one }) => ({
  project: one(projects, { fields: [opportunities.projectId], references: [projects.id] }),
  agentRun: one(agentRuns, { fields: [opportunities.agentRunId], references: [agentRuns.id] }),
  decidedBy: one(users, { fields: [opportunities.decidedByUserId], references: [users.id] }),
  pageProposals: many(pageProposals)
}));

export const rankingProofRelations = relations(rankingProofs, ({ one }) => ({
  project: one(projects, { fields: [rankingProofs.projectId], references: [projects.id] }),
  createdBy: one(users, { fields: [rankingProofs.createdByUserId], references: [users.id] }),
  reviewedBy: one(users, { fields: [rankingProofs.reviewedByUserId], references: [users.id] }),
  invalidatedBy: one(users, { fields: [rankingProofs.invalidatedByUserId], references: [users.id] })
}));

export const releasePlanRelations = relations(releasePlans, ({ many, one }) => ({
  project: one(projects, { fields: [releasePlans.projectId], references: [projects.id] }),
  createdBy: one(users, { fields: [releasePlans.createdByUserId], references: [users.id] }),
  items: many(releasePlanItems),
  checks: many(releaseChecks),
  notes: many(releaseNotes),
  deployments: many(deployments),
  verifications: many(releaseVerifications),
  rollbackPoints: many(rollbackPoints)
}));

export const deploymentRelations = relations(deployments, ({ many, one }) => ({
  project: one(projects, { fields: [deployments.projectId], references: [projects.id] }),
  releasePlan: one(releasePlans, { fields: [deployments.releasePlanId], references: [releasePlans.id] }),
  verifications: many(releaseVerifications),
  rollbackPoints: many(rollbackPoints)
}));

export const releaseVerificationRelations = relations(releaseVerifications, ({ many, one }) => ({
  releasePlan: one(releasePlans, { fields: [releaseVerifications.releasePlanId], references: [releasePlans.id] }),
  deployment: one(deployments, { fields: [releaseVerifications.deploymentId], references: [deployments.id] }),
  checks: many(releaseVerificationChecks)
}));

export const releaseVerificationCheckRelations = relations(releaseVerificationChecks, ({ one }) => ({
  verification: one(releaseVerifications, {
    fields: [releaseVerificationChecks.verificationId],
    references: [releaseVerifications.id]
  })
}));

export const gscConnectionRelations = relations(gscConnections, ({ many, one }) => ({
  project: one(projects, { fields: [gscConnections.projectId], references: [projects.id] }),
  syncRuns: many(gscSyncRuns)
}));

export const gscSyncRunRelations = relations(gscSyncRuns, ({ many, one }) => ({
  project: one(projects, { fields: [gscSyncRuns.projectId], references: [projects.id] }),
  connection: one(gscConnections, { fields: [gscSyncRuns.connectionId], references: [gscConnections.id] }),
  rows: many(gscSearchAnalyticsRows),
  opportunitySignals: many(gscOpportunitySignals)
}));

export const gscSearchAnalyticsRowRelations = relations(gscSearchAnalyticsRows, ({ one, many }) => ({
  project: one(projects, { fields: [gscSearchAnalyticsRows.projectId], references: [projects.id] }),
  syncRun: one(gscSyncRuns, { fields: [gscSearchAnalyticsRows.syncRunId], references: [gscSyncRuns.id] }),
  opportunitySignals: many(gscOpportunitySignals)
}));

export const gscOpportunitySignalRelations = relations(gscOpportunitySignals, ({ one }) => ({
  project: one(projects, { fields: [gscOpportunitySignals.projectId], references: [projects.id] }),
  syncRun: one(gscSyncRuns, { fields: [gscOpportunitySignals.syncRunId], references: [gscSyncRuns.id] }),
  row: one(gscSearchAnalyticsRows, { fields: [gscOpportunitySignals.rowId], references: [gscSearchAnalyticsRows.id] })
}));
