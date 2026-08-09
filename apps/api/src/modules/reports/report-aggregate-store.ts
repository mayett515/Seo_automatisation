import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  UnprocessableEntityException
} from "@nestjs/common";
import type { ImmutableArtifactReaderPort } from "@localseo/adapters";
import {
  CustomerReportArtifactSummarySchema,
  CustomerReportCandidateSummarySchema,
  CustomerReportClaimSchema,
  CustomerReportCompletedRollbackEvidenceSchema,
  CustomerReportDecisionNoteSchema,
  CustomerReportEvidenceItemSchema,
  CustomerReportEvidencePacketSchema,
  CustomerReportGenerationRunSchema,
  CustomerReportIdentitySchema,
  CustomerReportSnapshotSchema,
  customerReportHtmlMaxBytes,
  type CustomerReportArtifactSummary,
  type CustomerReportCandidateSummary,
  type CustomerReportGenerationRun,
  type CustomerReportIdentity,
  type CustomerReportSnapshot
} from "@localseo/contracts";
import {
  assembleCustomerReportFactProjection,
  buildCustomerReportHtmlRenderManifest,
  canonicalizeCustomerReportEvidencePacket,
  canonicalizeCustomerReportFactProjection,
  canonicalizeCustomerReportHtmlRenderManifest,
  canonicalizeCustomerReportSnapshot,
  canonicalizeCustomerReportSourcePayload,
  customerSafeReleaseWarningForCheck,
  decideCustomerReportGenerationWindow,
  decideCustomerReportSnapshotEligibility,
  normalizeCustomerReportFactProjection
} from "@localseo/domain";
import {
  deployments,
  opportunities,
  pageProposals,
  pageVersions,
  rankingProofs,
  releasePlans,
  releaseVerificationChecks,
  releaseVerifications,
  reportArtifacts,
  reportClaimEvidence,
  reportClaims,
  reportEvidenceItems,
  reportGenerationRuns,
  reportIssues,
  reports,
  rollbackPoints,
  type DatabaseClient
} from "@localseo/db";
import { and, asc, desc, eq, inArray, sql } from "@localseo/db/query";

export type DatabaseTransaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];
export type ReportIssueRow = typeof reportIssues.$inferSelect;
export type ReportGenerationRunRow = typeof reportGenerationRuns.$inferSelect;
export type ReportRow = typeof reports.$inferSelect;
export type ReportArtifactRow = typeof reportArtifacts.$inferSelect;

export type CustomerReportArtifactRetryTransition = {
  kind: "applied" | "replayed";
  report: ReportRow;
  artifact: ReportArtifactRow;
};

export type CustomerReportPublicationTransition = {
  kind: "applied" | "replayed";
  report: ReportRow;
  artifact: ReportArtifactRow;
  supersededReportId?: string;
};

export type CustomerReportGenerationAdmission = {
  kind: "created" | "already_active" | "replayed";
  reportIssueId: string;
  runId: string;
  status: ReportGenerationRunRow["status"];
};

export type CustomerReportDraftPersistence =
  | {
      kind: "persisted" | "replayed";
      reportIssueId: string;
      reportId: string;
      reportVersion: number;
      reportRowVersion: number;
      snapshotSha256: string;
    }
  | { kind: "stale"; reportIssueId: string; runId: string; reason: string };

export type CustomerReportReviewTransition =
  | {
      command: "submit_for_review";
      kind: "applied" | "replayed";
      reportId: string;
      status: "ready_for_review";
      rowVersion: number;
      snapshotSha256: string;
      artifact: ReportArtifactRow;
    }
  | {
      command: "request_changes";
      kind: "applied" | "replayed";
      reportId: string;
      status: "draft";
      rowVersion: number;
      snapshotSha256: string;
      renderArtifacts: "expired";
    };

export function requireArtifactReader(
  artifactReader: ImmutableArtifactReaderPort | undefined
): ImmutableArtifactReaderPort {
  if (!artifactReader) {
    throw new ServiceUnavailableException("Immutable report artifact storage is unavailable.");
  }
  return artifactReader;
}

export function generationAdmission(
  kind: CustomerReportGenerationAdmission["kind"],
  run: ReportGenerationRunRow
): CustomerReportGenerationAdmission {
  return { kind, reportIssueId: run.reportIssueId, runId: run.id, status: run.status };
}

export function persistedDraft(kind: "persisted" | "replayed", report: ReportRow): CustomerReportDraftPersistence {
  return {
    kind,
    reportIssueId: report.reportIssueId,
    reportId: report.id,
    reportVersion: report.versionNumber,
    reportRowVersion: report.rowVersion,
    snapshotSha256: report.snapshotSha256
  };
}

export function submitReviewResult(
  kind: "applied" | "replayed",
  report: ReportRow,
  artifact: ReportArtifactRow
): Extract<CustomerReportReviewTransition, { command: "submit_for_review" }> {
  if (report.status !== "ready_for_review") throw new Error("Submitted report review is not frozen for review.");
  return {
    command: "submit_for_review",
    kind,
    reportId: report.id,
    status: report.status,
    rowVersion: report.rowVersion,
    snapshotSha256: report.snapshotSha256,
    artifact
  };
}

export function requestChangesResult(
  kind: "applied" | "replayed",
  report: ReportRow
): Extract<CustomerReportReviewTransition, { command: "request_changes" }> {
  if (report.status !== "draft") throw new Error("Requested report changes did not restore draft truth.");
  return {
    command: "request_changes",
    kind,
    reportId: report.id,
    status: report.status,
    rowVersion: report.rowVersion,
    snapshotSha256: report.snapshotSha256,
    renderArtifacts: "expired"
  };
}

export function reportArtifactDefinition(report: ReportRow, issue: ReportIssueRow) {
  const identity = CustomerReportIdentitySchema.parse({
    projectId: issue.projectId,
    reportKind: issue.reportKind,
    period: issue.period,
    locale: issue.locale,
    timezone: issue.timezone
  });
  const manifest = buildCustomerReportHtmlRenderManifest({
    projectId: report.projectId,
    reportId: report.id,
    snapshotSha256: report.snapshotSha256,
    reportSchemaVersion: report.schemaVersion,
    templateVersion: report.templateVersion,
    locale: identity.locale,
    timezone: identity.timezone
  });
  const manifestCanonicalText = canonicalizeCustomerReportHtmlRenderManifest(manifest);
  return { manifest, manifestCanonicalText, manifestSha256: sha256(manifestCanonicalText) };
}

export async function loadLatestMatchingArtifact(
  tx: DatabaseTransaction,
  report: ReportRow,
  manifestSha256: string
): Promise<ReportArtifactRow | undefined> {
  const [artifact] = await tx
    .select()
    .from(reportArtifacts)
    .where(
      and(
        eq(reportArtifacts.reportId, report.id),
        eq(reportArtifacts.projectId, report.projectId),
        eq(reportArtifacts.snapshotSha256, report.snapshotSha256),
        eq(reportArtifacts.renderManifestSha256, manifestSha256)
      )
    )
    .orderBy(desc(reportArtifacts.createdAt), desc(reportArtifacts.id))
    .limit(1);
  return artifact;
}

export function reportArtifactSummary(artifact: ReportArtifactRow): CustomerReportArtifactSummary {
  return CustomerReportArtifactSummarySchema.parse({
    artifactId: artifact.id,
    reportId: artifact.reportId,
    format: artifact.format,
    status: artifact.status,
    snapshotSha256: artifact.snapshotSha256,
    manifestSha256: artifact.renderManifestSha256,
    artifactSha256: artifact.artifactSha256 ?? undefined,
    byteSize: artifact.byteSize ?? undefined,
    failureCode: artifact.failureCode ?? undefined,
    failureMessage: artifact.failureMessage ?? undefined,
    createdAt: artifact.createdAt.toISOString(),
    stagedAt: artifact.stagedAt?.toISOString()
  });
}

export function reportCandidateSummary(report: ReportRow, issue: ReportIssueRow): CustomerReportCandidateSummary {
  const snapshot = parseStoredReportSnapshot(report);
  return CustomerReportCandidateSummarySchema.parse({
    reportId: report.id,
    reportIssueId: report.reportIssueId,
    versionNumber: report.versionNumber,
    status: report.status,
    period: issue.period,
    title: snapshot.title,
    snapshotSha256: report.snapshotSha256,
    rowVersion: report.rowVersion,
    narrativeMode: report.narrativeMode,
    generatedAt: snapshot.generatedAt,
    evidenceCutoffAt: snapshot.evidenceCutoffAt,
    supersedesReportId: report.supersedesReportId ?? undefined,
    correctionReason: report.correctionReason ?? undefined,
    readyAt: report.readyAt?.toISOString(),
    createdAt: report.createdAt.toISOString()
  });
}

export function reportGenerationRunSummary(run: ReportGenerationRunRow): CustomerReportGenerationRun {
  return CustomerReportGenerationRunSchema.parse({
    reportIssueId: run.reportIssueId,
    runId: run.id,
    status: run.status,
    narrativeMode: run.narrativeMode,
    evidenceCutoffAt: run.evidenceCutoffAt.toISOString(),
    evidencePacketSha256: run.evidencePacketSha256 ?? undefined,
    resultReportId: run.resultReportId ?? undefined,
    failureCode: run.failureCode ?? undefined,
    failureMessage: run.failureMessage ?? undefined,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString(),
    finishedAt: run.finishedAt?.toISOString()
  });
}

export function requiredArtifact(artifact: ReportArtifactRow | undefined): ReportArtifactRow {
  if (!artifact) throw new Error("Report review did not produce a durable HTML artifact.");
  return artifact;
}

export async function lockAndLoadReportIssueByIdentity(
  tx: DatabaseTransaction,
  identity: CustomerReportIdentity
): Promise<ReportIssueRow | undefined> {
  await tx.execute(sql`
    SELECT "id"
    FROM "report_issues"
    WHERE "project_id" = ${identity.projectId}
      AND "report_kind" = ${identity.reportKind}
      AND "period" = ${identity.period}
      AND "locale" = ${identity.locale}
      AND "timezone" = ${identity.timezone}
    FOR UPDATE
  `);
  const [issue] = await tx
    .select()
    .from(reportIssues)
    .where(
      and(
        eq(reportIssues.projectId, identity.projectId),
        eq(reportIssues.reportKind, identity.reportKind),
        eq(reportIssues.period, identity.period),
        eq(reportIssues.locale, identity.locale),
        eq(reportIssues.timezone, identity.timezone)
      )
    )
    .limit(1);
  return issue;
}

export async function lockReportIssue(tx: DatabaseTransaction, reportIssueId: string): Promise<void> {
  await tx.execute(sql`SELECT "id" FROM "report_issues" WHERE "id" = ${reportIssueId} FOR UPDATE`);
}

export async function lockReportGenerationRun(
  tx: DatabaseTransaction,
  projectId: string,
  runId: string
): Promise<void> {
  await tx.execute(
    sql`SELECT "id" FROM "report_generation_runs" WHERE "id" = ${runId} AND "project_id" = ${projectId} FOR UPDATE`
  );
}

export async function lockReport(tx: DatabaseTransaction, projectId: string, reportId: string): Promise<void> {
  await tx.execute(sql`SELECT "id" FROM "reports" WHERE "id" = ${reportId} AND "project_id" = ${projectId} FOR UPDATE`);
}

export async function lockReportArtifacts(tx: DatabaseTransaction, projectId: string, reportId: string): Promise<void> {
  await tx.execute(sql`
    SELECT "id"
    FROM "report_artifacts"
    WHERE "project_id" = ${projectId} AND "report_id" = ${reportId}
    ORDER BY "id"
    FOR UPDATE
  `);
}

export async function loadCurrentCandidate(
  tx: DatabaseTransaction,
  issue: ReportIssueRow
): Promise<ReportRow | undefined> {
  if (!issue.currentCandidateReportId) {
    const [untracked] = await tx
      .select()
      .from(reports)
      .where(and(eq(reports.reportIssueId, issue.id), inArray(reports.status, ["draft", "ready_for_review"])))
      .limit(1);
    if (untracked) {
      throw new Error("Report issue candidate pointer is inconsistent with the open candidate index.");
    }
    return undefined;
  }

  const [candidate] = await tx
    .select()
    .from(reports)
    .where(and(eq(reports.id, issue.currentCandidateReportId), eq(reports.reportIssueId, issue.id)))
    .limit(1);
  if (!candidate || (candidate.status !== "draft" && candidate.status !== "ready_for_review")) {
    throw new Error("Report issue candidate pointer does not reference an open candidate.");
  }
  return candidate;
}

export function prepareSnapshot(input: unknown): {
  snapshot: CustomerReportSnapshot;
  snapshotCanonicalText: string;
  snapshotSha256: string;
  factProjectionSha256: string;
} {
  const snapshot = CustomerReportSnapshotSchema.parse(input);
  const eligibility = decideCustomerReportSnapshotEligibility(snapshot);
  if (eligibility.kind === "ineligible") {
    throw new UnprocessableEntityException({
      message: "Customer report snapshot contains ineligible claims.",
      claims: eligibility.claims
    });
  }

  const factProjectionSha256 = sha256(canonicalizeCustomerReportFactProjection(snapshot.factProjection));
  if (snapshot.factProjectionSha256 !== factProjectionSha256) {
    throw new UnprocessableEntityException(
      "Customer report fact projection digest does not match its canonical facts."
    );
  }
  const snapshotCanonicalText = canonicalizeCustomerReportSnapshot(snapshot);
  return {
    snapshot,
    snapshotCanonicalText,
    snapshotSha256: sha256(snapshotCanonicalText),
    factProjectionSha256
  };
}

export function assertSnapshotMatchesRun(
  snapshot: CustomerReportSnapshot,
  issue: ReportIssueRow,
  run: ReportGenerationRunRow
): void {
  const identity = snapshot.identity;
  if (
    identity.projectId !== issue.projectId ||
    identity.reportKind !== issue.reportKind ||
    identity.period !== issue.period ||
    identity.locale !== issue.locale ||
    identity.timezone !== issue.timezone
  ) {
    throw new UnprocessableEntityException("Customer report snapshot identity does not match its report issue.");
  }
  if (snapshot.evidenceCutoffAt !== run.evidenceCutoffAt.toISOString()) {
    throw new UnprocessableEntityException("Customer report snapshot cutoff does not match its generation run.");
  }
  if (
    snapshot.schemaVersion !== run.reportSchemaVersion ||
    snapshot.assemblerVersion !== run.assemblerVersion ||
    snapshot.eligibilityPolicyVersion !== run.eligibilityPolicyVersion ||
    snapshot.actionSelectionPolicyVersion !== run.actionSelectionPolicyVersion ||
    (run.narrativeMode === "fact_only" && snapshot.narrativeMode !== "fact_only")
  ) {
    throw new UnprocessableEntityException("Customer report snapshot policy versions do not match its generation run.");
  }
}

export async function generationStaleReason(
  tx: DatabaseTransaction,
  issue: ReportIssueRow,
  run: ReportGenerationRunRow
): Promise<string | undefined> {
  if (issue.rowVersion !== run.baseIssueRowVersion) {
    return "The report issue changed after generation admission.";
  }
  if (issue.currentCandidateReportId !== run.baseCandidateReportId) {
    return "The current report candidate changed after generation admission.";
  }
  if (issue.currentPublishedReportId !== run.correctionPredecessorReportId) {
    return "The published report changed after correction generation admission.";
  }
  if (!run.baseCandidateReportId) {
    return undefined;
  }

  const [candidate] = await tx.select().from(reports).where(eq(reports.id, run.baseCandidateReportId)).limit(1);
  if (
    !candidate ||
    candidate.status !== "draft" ||
    candidate.rowVersion !== run.baseCandidateRowVersion ||
    candidate.snapshotSha256 !== run.baseCandidateSnapshotSha256
  ) {
    return "The report draft was reviewed or regenerated after generation admission.";
  }
  return undefined;
}

export function reportValues(
  snapshot: CustomerReportSnapshot,
  prepared: ReturnType<typeof prepareSnapshot>,
  run: ReportGenerationRunRow,
  issue: ReportIssueRow,
  versionNumber: number
): typeof reports.$inferInsert {
  return {
    projectId: issue.projectId,
    reportIssueId: issue.id,
    versionNumber,
    status: "draft",
    ...reportSnapshotValues(snapshot, prepared, run),
    supersedesReportId: run.correctionPredecessorReportId,
    correctionReason: run.correctionReason,
    createdByActorType: "system",
    createdByUserId: run.requestedByUserId
  };
}

export function reportSnapshotValues(
  snapshot: CustomerReportSnapshot,
  prepared: ReturnType<typeof prepareSnapshot>,
  run: ReportGenerationRunRow
) {
  return {
    snapshotCanonicalText: prepared.snapshotCanonicalText,
    snapshotSha256: prepared.snapshotSha256,
    factProjectionSha256: prepared.factProjectionSha256,
    schemaVersion: snapshot.schemaVersion,
    assemblerVersion: snapshot.assemblerVersion,
    eligibilityPolicyVersion: snapshot.eligibilityPolicyVersion,
    actionSelectionPolicyVersion: snapshot.actionSelectionPolicyVersion,
    narrativePolicyVersion: snapshot.narrativePolicyVersion,
    templateVersion: snapshot.templateVersion,
    narrativeMode: snapshot.narrativeMode,
    sourceGenerationRunId: run.id,
    sourceAgentRunId: null,
    reviewedSnapshotSha256: null,
    readyAt: null
  } as const;
}

export async function persistReportProjection(
  tx: DatabaseTransaction,
  report: ReportRow,
  snapshot: CustomerReportSnapshot
): Promise<void> {
  const projection = normalizeCustomerReportFactProjection(snapshot.factProjection);
  const claimIds = new Map<string, string>();
  const evidenceIds = new Map<string, string>();

  if (projection.claims.length > 0) {
    await tx.insert(reportClaims).values(
      projection.claims.map((claim, ordinal) => {
        const id = randomUUID();
        claimIds.set(claim.claimKey, id);
        return {
          id,
          reportId: report.id,
          projectId: report.projectId,
          claimKey: claim.claimKey,
          claimKind: claim.kind,
          section: claim.section,
          ordinal,
          claimJson: claim
        };
      })
    );
  }

  if (projection.evidence.length > 0) {
    await tx.insert(reportEvidenceItems).values(
      projection.evidence.map((evidence) => {
        const id = randomUUID();
        evidenceIds.set(evidence.evidenceKey, id);
        return {
          id,
          reportId: report.id,
          projectId: report.projectId,
          evidenceKey: evidence.evidenceKey,
          sourceKind: evidence.sourceKind,
          sourceId: evidence.sourceId,
          sourceVersion: evidence.sourceVersion,
          proofTier: evidence.proofTier,
          observedAt: new Date(evidence.observedAt),
          selectedAtCutoff: new Date(evidence.selectedAtCutoff),
          payloadSha256: evidence.payloadSha256,
          ...evidenceSourceReferences(evidence),
          evidenceJson: evidence
        };
      })
    );
  }

  const links = projection.claims.flatMap((claim) =>
    claim.evidenceKeys.map((evidenceKey) => ({
      reportId: report.id,
      projectId: report.projectId,
      claimId: requiredMapValue(claimIds, claim.claimKey),
      evidenceId: requiredMapValue(evidenceIds, evidenceKey)
    }))
  );
  if (links.length > 0) {
    await tx.insert(reportClaimEvidence).values(links);
  }
}

export async function deleteReportProjection(tx: DatabaseTransaction, reportId: string): Promise<void> {
  await tx.delete(reportClaimEvidence).where(eq(reportClaimEvidence.reportId, reportId));
  await tx.delete(reportClaims).where(eq(reportClaims.reportId, reportId));
  await tx.delete(reportEvidenceItems).where(eq(reportEvidenceItems.reportId, reportId));
}

export async function validateStoredReport(
  tx: DatabaseTransaction,
  report: ReportRow
): Promise<CustomerReportSnapshot> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(report.snapshotCanonicalText);
  } catch {
    throw new UnprocessableEntityException("Stored customer report snapshot is not valid JSON.");
  }
  const prepared = prepareSnapshot(parsedJson);
  if (
    prepared.snapshotCanonicalText !== report.snapshotCanonicalText ||
    prepared.snapshotSha256 !== report.snapshotSha256 ||
    prepared.factProjectionSha256 !== report.factProjectionSha256
  ) {
    throw new UnprocessableEntityException("Stored customer report snapshot or digest is inconsistent.");
  }

  const claimRows = await tx
    .select()
    .from(reportClaims)
    .where(eq(reportClaims.reportId, report.id))
    .orderBy(asc(reportClaims.ordinal));
  const evidenceRows = await tx
    .select()
    .from(reportEvidenceItems)
    .where(eq(reportEvidenceItems.reportId, report.id))
    .orderBy(asc(reportEvidenceItems.evidenceKey));
  const linkRows = await tx
    .select({ claimId: reportClaimEvidence.claimId, evidenceId: reportClaimEvidence.evidenceId })
    .from(reportClaimEvidence)
    .where(eq(reportClaimEvidence.reportId, report.id));

  const evidenceKeyById = new Map(evidenceRows.map((row) => [row.id, row.evidenceKey]));
  const linkedKeysByClaimId = new Map<string, string[]>();
  for (const link of linkRows) {
    const evidenceKey = evidenceKeyById.get(link.evidenceId);
    if (!evidenceKey) {
      throw new UnprocessableEntityException("Stored report claim/evidence projection contains a dangling link.");
    }
    const keys = linkedKeysByClaimId.get(link.claimId) ?? [];
    keys.push(evidenceKey);
    linkedKeysByClaimId.set(link.claimId, keys);
  }

  const claims = claimRows.map((row, ordinal) => {
    const claim = CustomerReportClaimSchema.parse(row.claimJson);
    const linkedKeys = (linkedKeysByClaimId.get(row.id) ?? []).sort();
    const expectedKeys = [...claim.evidenceKeys].sort();
    if (
      row.projectId !== report.projectId ||
      row.claimKey !== claim.claimKey ||
      row.claimKind !== claim.kind ||
      row.section !== claim.section ||
      row.ordinal !== ordinal ||
      JSON.stringify(linkedKeys) !== JSON.stringify(expectedKeys)
    ) {
      throw new UnprocessableEntityException("Stored report claim projection does not match its canonical claim.");
    }
    return claim;
  });
  const evidence = evidenceRows.map((row) => {
    const item = CustomerReportEvidenceItemSchema.parse(row.evidenceJson);
    if (
      row.projectId !== report.projectId ||
      row.evidenceKey !== item.evidenceKey ||
      row.sourceKind !== item.sourceKind ||
      row.sourceId !== item.sourceId ||
      row.sourceVersion !== item.sourceVersion ||
      row.proofTier !== item.proofTier ||
      row.observedAt.toISOString() !== item.observedAt ||
      row.selectedAtCutoff.toISOString() !== item.selectedAtCutoff ||
      row.payloadSha256 !== item.payloadSha256 ||
      !evidenceProjectionReferencesMatch(row, item)
    ) {
      throw new UnprocessableEntityException(
        "Stored report evidence projection does not match its canonical evidence."
      );
    }
    return item;
  });

  const reconstructed = canonicalizeCustomerReportFactProjection({
    claims,
    evidence,
    nextActions: prepared.snapshot.factProjection.nextActions
  });
  if (reconstructed !== canonicalizeCustomerReportFactProjection(prepared.snapshot.factProjection)) {
    throw new UnprocessableEntityException(
      "Stored report provenance projection does not match the canonical snapshot."
    );
  }
  return prepared.snapshot;
}

export async function assertEvidenceSourcesBelongToProject(
  tx: DatabaseTransaction,
  projectId: string,
  snapshot: CustomerReportSnapshot
): Promise<void> {
  const evidence = snapshot.factProjection.evidence;
  await assertRankingSources(tx, projectId, evidence);
  await assertPageVersionSources(tx, projectId, evidence);
  await assertDeploymentSources(tx, projectId, evidence);
  await assertReleaseVerificationSources(tx, projectId, evidence);
  await assertReleaseVerificationCheckSources(tx, projectId, evidence);
  await assertRollbackSources(tx, projectId, evidence);
  await assertOpportunitySources(tx, projectId, evidence);
  await assertReleaseActionTargets(tx, projectId, snapshot);
}

export type ReportEvidenceItem = CustomerReportSnapshot["factProjection"]["evidence"][number];

async function assertRankingSources(
  tx: DatabaseTransaction,
  projectId: string,
  evidence: ReportEvidenceItem[]
): Promise<void> {
  const items = evidence.filter(
    (item): item is Extract<ReportEvidenceItem, { sourceKind: "ranking_proof" }> => item.sourceKind === "ranking_proof"
  );
  if (items.length === 0) return;
  const rows = await tx
    .select()
    .from(rankingProofs)
    .where(
      and(
        eq(rankingProofs.projectId, projectId),
        inArray(
          rankingProofs.id,
          items.map((item) => item.sourceId)
        )
      )
    );
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  for (const item of items) {
    const row = rowsById.get(item.sourceId);
    if (
      !row ||
      row.status !== "reviewed" ||
      row.query !== item.query ||
      row.pageUrl !== item.pageUrl ||
      row.rank !== item.rank ||
      row.searchEngine !== item.searchEngine ||
      row.device !== item.device ||
      (row.locale ?? "de-DE") !== item.locale ||
      row.capturedAt.toISOString() !== item.observedAt
    ) {
      throwEvidenceSourceMismatch();
    }
    expectSourceDigest(item, {
      sourceKind: "ranking_proof",
      id: row.id,
      projectId: row.projectId,
      query: row.query,
      pageUrl: row.pageUrl,
      rank: row.rank,
      capturedAt: row.capturedAt.toISOString(),
      searchEngine: row.searchEngine,
      device: row.device,
      locale: row.locale ?? "de-DE",
      status: row.status
    });
  }
}

async function assertPageVersionSources(
  tx: DatabaseTransaction,
  projectId: string,
  evidence: ReportEvidenceItem[]
): Promise<void> {
  const items = evidence.filter(
    (item): item is Extract<ReportEvidenceItem, { sourceKind: "page_version" }> => item.sourceKind === "page_version"
  );
  if (items.length === 0) return;
  const rows = await tx
    .select({ version: pageVersions, proposal: pageProposals })
    .from(pageVersions)
    .innerJoin(pageProposals, eq(pageVersions.pageProposalId, pageProposals.id))
    .where(
      and(
        eq(pageProposals.projectId, projectId),
        inArray(
          pageVersions.id,
          items.map((item) => item.pageVersionId)
        )
      )
    );
  const rowsById = new Map(rows.map((row) => [row.version.id, row]));
  for (const item of items) {
    const row = rowsById.get(item.pageVersionId);
    if (
      !row ||
      !row.version.approvedAt ||
      row.proposal.route !== item.route ||
      row.version.versionNumber !== item.versionNumber ||
      row.version.status !== item.status ||
      row.version.approvedAt.toISOString() !== item.approvedAt ||
      row.version.updatedAt.toISOString() !== item.observedAt
    ) {
      throwEvidenceSourceMismatch();
    }
    expectSourceDigest(item, {
      sourceKind: "page_version",
      id: row.version.id,
      projectId,
      route: row.proposal.route,
      versionNumber: row.version.versionNumber,
      status: row.version.status,
      approvedAt: row.version.approvedAt.toISOString(),
      updatedAt: row.version.updatedAt.toISOString()
    });
  }
}

async function assertDeploymentSources(
  tx: DatabaseTransaction,
  projectId: string,
  evidence: ReportEvidenceItem[]
): Promise<void> {
  const items = evidence.filter(
    (item): item is Extract<ReportEvidenceItem, { sourceKind: "deployment" }> => item.sourceKind === "deployment"
  );
  if (items.length === 0) return;
  const rows = await tx
    .select({ deployment: deployments, releasePlan: releasePlans })
    .from(deployments)
    .innerJoin(releasePlans, eq(deployments.releasePlanId, releasePlans.id))
    .where(
      and(
        eq(deployments.projectId, projectId),
        inArray(
          deployments.id,
          items.map((item) => item.deploymentId)
        )
      )
    );
  const rowsById = new Map(rows.map((row) => [row.deployment.id, row]));
  for (const item of items) {
    const row = rowsById.get(item.deploymentId);
    if (
      !row ||
      !row.deployment.providerDeployId ||
      !row.releasePlan.deployedAt ||
      row.releasePlan.id !== item.releasePlanId ||
      row.deployment.provider !== item.provider ||
      row.deployment.providerDeployId !== item.providerDeployId ||
      row.deployment.status !== item.status ||
      row.releasePlan.deployedAt.toISOString() !== item.handedOffAt ||
      row.releasePlan.deployedAt.toISOString() !== item.observedAt
    ) {
      throwEvidenceSourceMismatch();
    }
    expectSourceDigest(item, {
      sourceKind: "deployment",
      id: row.deployment.id,
      projectId: row.deployment.projectId,
      releasePlanId: row.releasePlan.id,
      provider: row.deployment.provider,
      providerDeployId: row.deployment.providerDeployId,
      status: row.deployment.status,
      handedOffAt: row.releasePlan.deployedAt.toISOString()
    });
  }
}

async function assertReleaseVerificationSources(
  tx: DatabaseTransaction,
  projectId: string,
  evidence: ReportEvidenceItem[]
): Promise<void> {
  const items = evidence.filter(
    (item): item is Extract<ReportEvidenceItem, { sourceKind: "release_verification" }> =>
      item.sourceKind === "release_verification"
  );
  if (items.length === 0) return;

  const rows = await tx
    .select({ verification: releaseVerifications, deployment: deployments })
    .from(releaseVerifications)
    .innerJoin(releasePlans, eq(releaseVerifications.releasePlanId, releasePlans.id))
    .innerJoin(deployments, eq(releaseVerifications.deploymentId, deployments.id))
    .where(
      and(
        eq(releasePlans.projectId, projectId),
        eq(deployments.projectId, projectId),
        inArray(
          releaseVerifications.id,
          items.map((item) => item.verificationId)
        )
      )
    );
  const rowsById = new Map(rows.map((row) => [row.verification.id, row]));
  for (const item of items) {
    const row = rowsById.get(item.verificationId);
    if (
      !row ||
      row.verification.deploymentId !== item.deploymentId ||
      row.verification.releasePlanId !== item.releasePlanId ||
      row.verification.status !== item.status ||
      row.verification.checkedAt.toISOString() !== item.checkedAt ||
      row.verification.checkedAt.toISOString() !== item.observedAt
    ) {
      throwEvidenceSourceMismatch();
    }
    expectSourceDigest(item, {
      sourceKind: "release_verification",
      id: row.verification.id,
      projectId: row.deployment.projectId,
      releasePlanId: row.verification.releasePlanId,
      deploymentId: row.verification.deploymentId,
      status: row.verification.status,
      checkedAt: row.verification.checkedAt.toISOString()
    });
  }
}

async function assertReleaseVerificationCheckSources(
  tx: DatabaseTransaction,
  projectId: string,
  evidence: ReportEvidenceItem[]
): Promise<void> {
  const items = evidence.filter(
    (item): item is Extract<ReportEvidenceItem, { sourceKind: "release_verification_check" }> =>
      item.sourceKind === "release_verification_check"
  );
  if (items.length === 0) return;

  const rows = await tx
    .select({ check: releaseVerificationChecks, projectId: releasePlans.projectId, releasePlanId: releasePlans.id })
    .from(releaseVerificationChecks)
    .innerJoin(releaseVerifications, eq(releaseVerificationChecks.verificationId, releaseVerifications.id))
    .innerJoin(releasePlans, eq(releaseVerifications.releasePlanId, releasePlans.id))
    .where(
      and(
        eq(releasePlans.projectId, projectId),
        inArray(
          releaseVerificationChecks.id,
          items.map((item) => item.sourceId)
        )
      )
    );
  const rowsById = new Map(rows.map((row) => [row.check.id, row]));
  for (const item of items) {
    const row = rowsById.get(item.sourceId);
    const customerCopy = row ? customerSafeReleaseWarningForCheck(row.check.checkKey, row.check.scope) : undefined;
    if (
      !row ||
      !customerCopy ||
      row.check.verificationId !== item.verificationId ||
      row.releasePlanId !== item.releasePlanId ||
      row.check.checkKey !== item.checkKey ||
      row.check.severity !== item.severity ||
      row.check.result !== "failed" ||
      customerCopy.title !== item.customerLabel ||
      customerCopy.summary !== item.summary ||
      row.check.checkedAt.toISOString() !== item.checkedAt ||
      row.check.checkedAt.toISOString() !== item.observedAt
    ) {
      throwEvidenceSourceMismatch();
    }
    expectSourceDigest(item, {
      sourceKind: "release_verification_check",
      id: row.check.id,
      projectId: row.projectId,
      releasePlanId: row.releasePlanId,
      verificationId: row.check.verificationId,
      checkKey: row.check.checkKey,
      scope: row.check.scope,
      severity: row.check.severity,
      result: row.check.result,
      message: row.check.message,
      checkedAt: row.check.checkedAt.toISOString()
    });
  }
}

export function assertSnapshotMatchesEvidencePacket(
  run: ReportGenerationRunRow,
  snapshot: CustomerReportSnapshot
): void {
  if (!run.evidencePacketCanonicalText || !run.evidencePacketSha256) {
    throw new UnprocessableEntityException("Report generation has no server-owned evidence packet.");
  }
  let packetInput: unknown;
  try {
    packetInput = JSON.parse(run.evidencePacketCanonicalText);
  } catch {
    throw new UnprocessableEntityException("Stored report evidence packet is not canonical JSON.");
  }
  const packet = CustomerReportEvidencePacketSchema.parse(packetInput);
  if (
    canonicalizeCustomerReportEvidencePacket(packet) !== run.evidencePacketCanonicalText ||
    sha256(run.evidencePacketCanonicalText) !== run.evidencePacketSha256 ||
    packet.identity.projectId !== snapshot.identity.projectId ||
    packet.identity.reportKind !== snapshot.identity.reportKind ||
    packet.identity.period !== snapshot.identity.period ||
    packet.identity.locale !== snapshot.identity.locale ||
    packet.identity.timezone !== snapshot.identity.timezone ||
    packet.evidenceCutoffAt !== snapshot.evidenceCutoffAt ||
    packet.assembledAt !== snapshot.generatedAt ||
    canonicalizeCustomerReportFactProjection(assembleCustomerReportFactProjection(packet)) !==
      canonicalizeCustomerReportFactProjection(snapshot.factProjection)
  ) {
    throw new UnprocessableEntityException(
      "Customer report snapshot does not match its server-owned evidence packet and assembly policy."
    );
  }
}

async function assertReleaseActionTargets(
  tx: DatabaseTransaction,
  projectId: string,
  snapshot: CustomerReportSnapshot
): Promise<void> {
  const actions = snapshot.factProjection.nextActions.filter(
    (action): action is typeof action & { target: { surface: "release_review"; releasePlanId: string } } =>
      action.target.surface === "release_review"
  );
  if (actions.length === 0) return;
  const planIds = [...new Set(actions.map((action) => action.target.releasePlanId))];
  const planRows = await tx
    .select({ id: releasePlans.id })
    .from(releasePlans)
    .where(and(eq(releasePlans.projectId, projectId), inArray(releasePlans.id, planIds)));
  if (planRows.length !== planIds.length) throwEvidenceSourceMismatch();
}

async function assertRollbackSources(
  tx: DatabaseTransaction,
  projectId: string,
  evidence: ReportEvidenceItem[]
): Promise<void> {
  const items = evidence.filter(
    (item): item is Extract<ReportEvidenceItem, { sourceKind: "rollback" }> => item.sourceKind === "rollback"
  );
  if (items.length === 0) return;

  const rows = await tx
    .select({ rollbackPoint: rollbackPoints, deployment: deployments })
    .from(rollbackPoints)
    .innerJoin(deployments, eq(rollbackPoints.releasePlanId, deployments.releasePlanId))
    .where(
      and(
        eq(rollbackPoints.projectId, projectId),
        eq(deployments.projectId, projectId),
        inArray(
          rollbackPoints.id,
          items.map((item) => item.rollbackPointId)
        )
      )
    );
  const rowsById = new Map(rows.map((row) => [row.rollbackPoint.id, row]));
  for (const item of items) {
    const row = rowsById.get(item.rollbackPointId);
    const execution = CustomerReportCompletedRollbackEvidenceSchema.safeParse(
      recordFromUnknown(row?.rollbackPoint.evidenceJson).rollbackExecution
    );
    if (
      !row ||
      !execution.success ||
      row.rollbackPoint.releasePlanId !== item.releasePlanId ||
      row.deployment.id !== item.deploymentId ||
      row.deployment.status !== "rolled_back" ||
      execution.data.executedAt !== item.rolledBackAt ||
      execution.data.executedAt !== item.observedAt
    ) {
      throwEvidenceSourceMismatch();
    }
    expectSourceDigest(item, {
      sourceKind: "rollback",
      id: row.rollbackPoint.id,
      projectId: row.rollbackPoint.projectId,
      releasePlanId: row.rollbackPoint.releasePlanId,
      deploymentId: row.deployment.id,
      restoreSourceDeploymentId: row.rollbackPoint.deploymentId,
      status: execution.data.status,
      rolledBackAt: execution.data.executedAt,
      providerDeployId: execution.data.providerDeployId
    });
  }
}

async function assertOpportunitySources(
  tx: DatabaseTransaction,
  projectId: string,
  evidence: ReportEvidenceItem[]
): Promise<void> {
  const items = evidence.filter(
    (item): item is Extract<ReportEvidenceItem, { sourceKind: "opportunity" }> => item.sourceKind === "opportunity"
  );
  if (items.length === 0) return;
  const rows = await tx
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.projectId, projectId),
        inArray(
          opportunities.id,
          items.map((item) => item.opportunityId)
        )
      )
    );
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  for (const item of items) {
    const row = rowsById.get(item.opportunityId);
    if (
      !row ||
      row.classification !== item.classification ||
      row.status !== item.status ||
      row.primaryKeyword !== item.title ||
      row.updatedAt.toISOString() !== item.observedAt
    ) {
      throwEvidenceSourceMismatch();
    }
    expectSourceDigest(item, {
      sourceKind: "opportunity",
      id: row.id,
      projectId: row.projectId,
      classification: row.classification,
      status: row.status,
      title: row.primaryKeyword,
      score: row.score,
      updatedAt: row.updatedAt.toISOString()
    });
  }
}

function throwEvidenceSourceMismatch(): never {
  throw new UnprocessableEntityException(
    "Customer report evidence source relationship was missing, mismatched, or belonged to another project."
  );
}

function expectSourceDigest(item: ReportEvidenceItem, payload: unknown): void {
  const digest = sha256(canonicalizeCustomerReportSourcePayload(payload));
  if (item.payloadSha256 !== digest || item.sourceVersion !== digest) throwEvidenceSourceMismatch();
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function evidenceSourceReferences(evidence: CustomerReportSnapshot["factProjection"]["evidence"][number]) {
  switch (evidence.sourceKind) {
    case "ranking_proof":
      return { rankingProofId: evidence.sourceId };
    case "page_version":
      return { pageVersionId: evidence.pageVersionId };
    case "deployment":
      return { deploymentId: evidence.deploymentId };
    case "release_verification":
      return { releaseVerificationId: evidence.verificationId };
    case "release_verification_check":
      return { releaseVerificationCheckId: evidence.sourceId, releaseVerificationId: evidence.verificationId };
    case "rollback":
      return { rollbackPointId: evidence.rollbackPointId };
    case "opportunity":
      return { opportunityId: evidence.opportunityId };
  }
}

function evidenceProjectionReferencesMatch(
  row: typeof reportEvidenceItems.$inferSelect,
  evidence: CustomerReportSnapshot["factProjection"]["evidence"][number]
): boolean {
  const expected = evidenceSourceReferences(evidence);
  return (
    row.rankingProofId === ("rankingProofId" in expected ? expected.rankingProofId : null) &&
    row.pageVersionId === ("pageVersionId" in expected ? expected.pageVersionId : null) &&
    row.deploymentId === ("deploymentId" in expected ? expected.deploymentId : null) &&
    row.releaseVerificationId === ("releaseVerificationId" in expected ? expected.releaseVerificationId : null) &&
    row.releaseVerificationCheckId ===
      ("releaseVerificationCheckId" in expected ? expected.releaseVerificationCheckId : null) &&
    row.rollbackPointId === ("rollbackPointId" in expected ? expected.rollbackPointId : null) &&
    row.opportunityId === ("opportunityId" in expected ? expected.opportunityId : null)
  );
}

function requiredMapValue(map: Map<string, string>, key: string): string {
  const value = map.get(key);
  if (!value) {
    throw new Error(`Missing report projection id for ${key}.`);
  }
  return value;
}

export function parseOptionalDecisionNote(value: string | undefined): string | null {
  if (value === undefined) return null;
  const parsed = CustomerReportDecisionNoteSchema.safeParse(value);
  if (!parsed.success || parsed.data.trim().length === 0) {
    throw new BadRequestException("Report correction requires a bounded decision note.");
  }
  return parsed.data;
}

export function validateReportCommandTarget(
  input: {
    projectId: string;
    reportId: string;
    actorUserId: string;
    requestId: string;
    expectedSnapshotSha256: string;
    expectedRowVersion: number;
  },
  label: string
): void {
  requireUuid(input.projectId, "Report project id must be a UUID.");
  requireUuid(input.reportId, "Report id must be a UUID.");
  requireUuid(input.actorUserId, `${label} requires a persisted human actor.`);
  requireUuid(input.requestId, `${label} request id must be a UUID.`);
  requireSha256(input.expectedSnapshotSha256, `${label} requires an exact snapshot digest.`);
  if (!Number.isSafeInteger(input.expectedRowVersion) || input.expectedRowVersion < 0) {
    throw new BadRequestException(`${label} requires a non-negative expected row version.`);
  }
}

export function assertReportCommandTarget(
  report: ReportRow,
  input: { expectedSnapshotSha256: string; expectedRowVersion: number },
  message: string
): void {
  if (report.snapshotSha256 !== input.expectedSnapshotSha256 || report.rowVersion !== input.expectedRowVersion) {
    throw new ConflictException(message);
  }
}

export function parseStoredReportSnapshot(report: ReportRow): CustomerReportSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(report.snapshotCanonicalText);
  } catch {
    throw new UnprocessableEntityException("Stored customer report snapshot is not valid JSON.");
  }
  const prepared = prepareSnapshot(parsed);
  if (
    prepared.snapshotCanonicalText !== report.snapshotCanonicalText ||
    prepared.snapshotSha256 !== report.snapshotSha256 ||
    prepared.factProjectionSha256 !== report.factProjectionSha256
  ) {
    throw new UnprocessableEntityException("Stored customer report snapshot or digest is inconsistent.");
  }
  return prepared.snapshot;
}

export async function verifyImmutableArtifactBytes(
  reader: ImmutableArtifactReaderPort,
  artifact: ReportArtifactRow
): Promise<Uint8Array> {
  if (
    artifact.status !== "staged" ||
    !artifact.storageKey ||
    !artifact.artifactSha256 ||
    artifact.byteSize === null ||
    artifact.byteSize > customerReportHtmlMaxBytes
  ) {
    throw new ConflictException(
      "Report document access requires a bounded staged artifact with immutable byte evidence."
    );
  }
  let body: Uint8Array;
  try {
    body = await reader.readImmutableArtifact({ key: artifact.storageKey, maxBytes: artifact.byteSize + 1 });
  } catch (error) {
    throw new ServiceUnavailableException("Report artifact bytes are unavailable.", { cause: error });
  }
  if (body.byteLength !== artifact.byteSize || sha256Bytes(body) !== artifact.artifactSha256) {
    throw new ServiceUnavailableException("Report artifact bytes failed immutable digest verification.");
  }
  return body;
}

export async function lockReports(tx: DatabaseTransaction, projectId: string, reportIds: string[]): Promise<void> {
  for (const reportId of [...new Set(reportIds)].sort()) {
    await lockReport(tx, projectId, reportId);
  }
}

export async function lockCustomerReportEvidenceSources(
  tx: DatabaseTransaction,
  snapshot: CustomerReportSnapshot
): Promise<void> {
  const projectId = snapshot.identity.projectId;
  // Release writers pin rv -> checks -> rollback -> deployment -> page version.
  const sourceKinds = [
    "ranking_proof",
    "release_verification",
    "release_verification_check",
    "rollback",
    "deployment",
    "page_version",
    "opportunity"
  ] as const;
  for (const sourceKind of sourceKinds) {
    const sourceIds = [
      ...new Set(
        snapshot.factProjection.evidence
          .filter((evidence) => evidence.sourceKind === sourceKind)
          .map((evidence) => evidence.sourceId)
      )
    ].sort();
    for (const sourceId of sourceIds) {
      switch (sourceKind) {
        case "ranking_proof":
          await tx.execute(
            sql`SELECT "id" FROM "ranking_proofs" WHERE "id" = ${sourceId} AND "project_id" = ${projectId} FOR UPDATE`
          );
          break;
        case "page_version":
          await tx.execute(sql`
            SELECT pv."id" FROM "page_versions" pv
            INNER JOIN "page_proposals" pp ON pp."id" = pv."page_proposal_id"
            WHERE pv."id" = ${sourceId} AND pp."project_id" = ${projectId}
            FOR UPDATE OF pv
          `);
          break;
        case "deployment":
          await tx.execute(
            sql`SELECT "id" FROM "deployments" WHERE "id" = ${sourceId} AND "project_id" = ${projectId} FOR UPDATE`
          );
          break;
        case "release_verification":
          await tx.execute(sql`
            SELECT rv."id" FROM "release_verifications" rv
            INNER JOIN "deployments" d ON d."id" = rv."deployment_id"
            WHERE rv."id" = ${sourceId} AND d."project_id" = ${projectId}
            FOR UPDATE OF rv
          `);
          break;
        case "release_verification_check":
          await tx.execute(sql`
            SELECT rvc."id" FROM "release_verification_checks" rvc
            INNER JOIN "release_verifications" rv ON rv."id" = rvc."release_verification_id"
            INNER JOIN "deployments" d ON d."id" = rv."deployment_id"
            WHERE rvc."id" = ${sourceId} AND d."project_id" = ${projectId}
            FOR UPDATE OF rvc
          `);
          break;
        case "rollback":
          await tx.execute(
            sql`SELECT "id" FROM "rollback_points" WHERE "id" = ${sourceId} AND "project_id" = ${projectId} FOR UPDATE`
          );
          break;
        case "opportunity":
          await tx.execute(
            sql`SELECT "id" FROM "opportunities" WHERE "id" = ${sourceId} AND "project_id" = ${projectId} FOR UPDATE`
          );
          break;
      }
    }
  }
}

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function isString(value: string | null | undefined): value is string {
  return typeof value === "string";
}

export function isActiveGenerationStatus(status: ReportGenerationRunRow["status"]): boolean {
  return ["queued", "assembling", "narrative_running", "validating"].includes(status);
}

export function parseTimestamp(value: string, message: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new BadRequestException(message);
  }
  return date;
}

export function requireUuid(value: string, message: string): void {
  if (!isUuid(value)) {
    throw new BadRequestException(message);
  }
}

export function requireSha256(value: string, message: string): void {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new BadRequestException(message);
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

export function assertCustomerReportGenerationWindow(period: string, evidenceCutoffAt: Date, now: Date): void {
  const generationWindow = decideCustomerReportGenerationWindow({ period, evidenceCutoffAt, now });
  if (generationWindow.kind === "deny") {
    throw new BadRequestException(
      `Report evidence cutoff is outside the accepted monthly window: ${generationWindow.reason}.`
    );
  }
}
