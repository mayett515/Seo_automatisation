import { createHash } from "node:crypto";
import type { AgentRunEvidenceSourceKind } from "@localseo/contracts";
import {
  buildOpportunityResearchQuerySeeds,
  canonicalizeOpportunityResearchMaterial,
  canonicalizeProjectBusinessProfileContent,
  opportunityResearchReadinessIssues
} from "@localseo/domain";
import canonicalize from "canonicalize";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { DatabaseClient } from "./client.js";
import {
  areas,
  gscSearchAnalyticsRows,
  gscSyncRuns,
  projectBusinessProfileRevisions,
  projectBusinessProfiles,
  projectKnowledgeDocuments,
  projectKnowledgeTaskScopes,
  projectKnowledgeVersions,
  projectOpportunityResearchStates,
  pageProposals,
  rankingProofs,
  services,
  websiteImportRuns
} from "./schema.js";

const DEFAULT_GSC_FRESHNESS_DAYS = 90;
const DEFAULT_RANKING_PROOF_FRESHNESS_DAYS = 30;
const OPPORTUNITY_RESEARCH_PACKET_MAX_BYTES = 120_000;

export type OpportunityResearchMaterialSource = {
  evidenceKey: string;
  sourceKind: AgentRunEvidenceSourceKind;
  sourceId: string;
  sourceVersion: string;
};

export type OpportunityResearchMaterial = {
  projectId: string;
  materialDigest: string;
  profileRevisionId?: string;
  readinessIssues: string[];
  initialQueries: string[];
  evidencePacket: Record<string, unknown>;
  evidenceSources: OpportunityResearchMaterialSource[];
  sourceVersions: string[];
  paused: boolean;
  packetBytes: number;
};

export async function loadOpportunityResearchMaterial(
  db: Pick<DatabaseClient, "select">,
  projectId: string,
  options: { asOf?: Date; gscFreshnessDays?: number; rankingProofFreshnessDays?: number } = {}
): Promise<OpportunityResearchMaterial> {
  const asOf = options.asOf ?? new Date();
  const gscCutoff = daysBefore(asOf, options.gscFreshnessDays ?? DEFAULT_GSC_FRESHNESS_DAYS);
  const proofCutoff = daysBefore(asOf, options.rankingProofFreshnessDays ?? DEFAULT_RANKING_PROOF_FRESHNESS_DAYS);
  const [profileRow] = await db
    .select({ profile: projectBusinessProfiles, revision: projectBusinessProfileRevisions })
    .from(projectBusinessProfiles)
    .leftJoin(
      projectBusinessProfileRevisions,
      eq(projectBusinessProfileRevisions.id, projectBusinessProfiles.currentRevisionId)
    )
    .where(eq(projectBusinessProfiles.projectId, projectId))
    .limit(1);
  const serviceRows = await db
    .select({
      id: services.id,
      name: services.name,
      rowVersion: services.rowVersion,
      confirmedAt: services.confirmedAt,
      confirmedByUserId: services.confirmedByUserId
    })
    .from(services)
    .where(and(eq(services.projectId, projectId), eq(services.status, "confirmed")))
    .orderBy(asc(services.id))
    .limit(100);
  const areaRows = await db
    .select({
      id: areas.id,
      name: areas.name,
      kind: areas.kind,
      rowVersion: areas.rowVersion,
      confirmedAt: areas.confirmedAt,
      confirmedByUserId: areas.confirmedByUserId
    })
    .from(areas)
    .where(and(eq(areas.projectId, projectId), eq(areas.status, "confirmed")))
    .orderBy(asc(areas.id))
    .limit(100);
  const knowledgeRows = await db
    .select({
      id: projectKnowledgeVersions.id,
      documentKey: projectKnowledgeDocuments.documentKey,
      version: projectKnowledgeVersions.version,
      title: projectKnowledgeVersions.title,
      bodyMarkdown: projectKnowledgeVersions.bodyMarkdown,
      contentSha256: projectKnowledgeVersions.contentSha256,
      modelUsePolicy: projectKnowledgeVersions.modelUsePolicy,
      createdAt: projectKnowledgeVersions.createdAt
    })
    .from(projectKnowledgeDocuments)
    .innerJoin(
      projectKnowledgeVersions,
      eq(projectKnowledgeVersions.id, projectKnowledgeDocuments.currentApprovedVersionId)
    )
    .innerJoin(projectKnowledgeTaskScopes, eq(projectKnowledgeTaskScopes.versionId, projectKnowledgeVersions.id))
    .where(
      and(
        eq(projectKnowledgeDocuments.projectId, projectId),
        sql`${projectKnowledgeDocuments.retiredAt} is null`,
        eq(projectKnowledgeVersions.status, "approved"),
        eq(projectKnowledgeVersions.modelUsePolicy, "model_allowed"),
        eq(projectKnowledgeTaskScopes.taskScope, "opportunity_research")
      )
    )
    .orderBy(desc(projectKnowledgeVersions.createdAt), asc(projectKnowledgeVersions.id))
    .limit(10);
  const importCandidates = await db
    .select({
      id: websiteImportRuns.id,
      mainWebsiteId: websiteImportRuns.mainWebsiteId,
      sourceUrl: websiteImportRuns.sourceUrl,
      summaryJson: websiteImportRuns.summaryJson,
      completedAt: websiteImportRuns.completedAt
    })
    .from(websiteImportRuns)
    .where(and(eq(websiteImportRuns.projectId, projectId), eq(websiteImportRuns.status, "completed")))
    .orderBy(desc(websiteImportRuns.completedAt), asc(websiteImportRuns.id))
    .limit(20);
  const importRows = firstPerKey(importCandidates, (row) => row.mainWebsiteId ?? row.sourceUrl).slice(0, 3);
  const gscSyncCandidates = await db
    .select({
      id: gscSyncRuns.id,
      propertyUrl: gscSyncRuns.propertyUrl,
      dateFrom: gscSyncRuns.dateFrom,
      dateTo: gscSyncRuns.dateTo,
      completedAt: gscSyncRuns.completedAt
    })
    .from(gscSyncRuns)
    .where(
      and(
        eq(gscSyncRuns.projectId, projectId),
        eq(gscSyncRuns.status, "completed"),
        gte(gscSyncRuns.dateTo, isoDate(gscCutoff)),
        lte(gscSyncRuns.dateTo, isoDate(asOf))
      )
    )
    .orderBy(desc(gscSyncRuns.dateTo), desc(gscSyncRuns.completedAt), asc(gscSyncRuns.id))
    .limit(30);
  const selectedGscSyncs = firstPerKey(gscSyncCandidates, (row) => row.propertyUrl).slice(0, 3);
  const selectedGscSyncIds = selectedGscSyncs.map((row) => row.id);
  const gscRows = selectedGscSyncIds.length
    ? await db
        .select({
          id: gscSearchAnalyticsRows.id,
          syncRunId: gscSearchAnalyticsRows.syncRunId,
          propertyUrl: gscSearchAnalyticsRows.propertyUrl,
          query: gscSearchAnalyticsRows.query,
          pageUrl: gscSearchAnalyticsRows.pageUrl,
          clicks: gscSearchAnalyticsRows.clicks,
          impressions: gscSearchAnalyticsRows.impressions,
          ctr: gscSearchAnalyticsRows.ctr,
          position: gscSearchAnalyticsRows.position,
          dateFrom: gscSyncRuns.dateFrom,
          dateTo: gscSyncRuns.dateTo
        })
        .from(gscSearchAnalyticsRows)
        .innerJoin(gscSyncRuns, eq(gscSyncRuns.id, gscSearchAnalyticsRows.syncRunId))
        .where(
          and(
            eq(gscSearchAnalyticsRows.projectId, projectId),
            inArray(gscSearchAnalyticsRows.syncRunId, selectedGscSyncIds)
          )
        )
        .orderBy(desc(gscSyncRuns.dateTo), desc(gscSearchAnalyticsRows.impressions), asc(gscSearchAnalyticsRows.id))
        .limit(50)
    : [];
  const proofRows = await db
    .select({
      id: rankingProofs.id,
      query: rankingProofs.query,
      pageUrl: rankingProofs.pageUrl,
      rank: rankingProofs.rank,
      capturedAt: rankingProofs.capturedAt,
      rowVersion: rankingProofs.rowVersion,
      reviewedAt: rankingProofs.reviewedAt,
      reviewedByUserId: rankingProofs.reviewedByUserId,
      searchEngine: rankingProofs.searchEngine,
      device: rankingProofs.device,
      locale: rankingProofs.locale
    })
    .from(rankingProofs)
    .where(
      and(
        eq(rankingProofs.projectId, projectId),
        eq(rankingProofs.status, "reviewed"),
        gte(rankingProofs.capturedAt, proofCutoff),
        lte(rankingProofs.capturedAt, asOf)
      )
    )
    .orderBy(desc(rankingProofs.capturedAt), asc(rankingProofs.id))
    .limit(20);
  const existingRoutes = await db
    .select({ route: pageProposals.route })
    .from(pageProposals)
    .where(eq(pageProposals.projectId, projectId))
    .orderBy(asc(pageProposals.route))
    .limit(100);
  const [state] = await db
    .select({ status: projectOpportunityResearchStates.status, pausedAt: projectOpportunityResearchStates.pausedAt })
    .from(projectOpportunityResearchStates)
    .where(eq(projectOpportunityResearchStates.projectId, projectId))
    .limit(1);

  const readinessIssues = opportunityResearchReadinessIssues({
    profileConfirmed: profileRow?.profile.status === "confirmed" && Boolean(profileRow.revision),
    confirmedServiceCount: serviceRows.length,
    confirmedAreaCount: areaRows.length,
    eligibleSourceCount: knowledgeRows.length + importRows.length + gscRows.length + proofRows.length,
    paused: state?.pausedAt !== null && state?.pausedAt !== undefined
  });
  if (profileRow?.revision) {
    const actualProfileSha256 = sha256(canonicalizeProjectBusinessProfileContent(profileRow.revision.profileJson));
    if (actualProfileSha256 !== profileRow.revision.profileSha256)
      readinessIssues.push("business_profile_digest_mismatch");
  }
  const validKnowledgeRows = knowledgeRows.filter((row) => {
    const valid = sha256(row.bodyMarkdown) === row.contentSha256;
    if (!valid && !readinessIssues.includes("knowledge_digest_mismatch"))
      readinessIssues.push("knowledge_digest_mismatch");
    return valid;
  });

  const materialSources: OpportunityResearchMaterialSource[] = [];
  const addSource = (sourceKind: AgentRunEvidenceSourceKind, sourceId: string, sourceVersion: string) => {
    materialSources.push({
      evidenceKey: `${sourceKind}:${sourceId}`,
      sourceKind,
      sourceId,
      sourceVersion
    });
  };
  if (profileRow?.revision) {
    addSource("business_profile_revision", profileRow.revision.id, `sha256:${profileRow.revision.profileSha256}`);
  }
  for (const row of serviceRows) addSource("canonical_service", row.id, `row-version:${row.rowVersion}`);
  for (const row of areaRows) addSource("canonical_area", row.id, `row-version:${row.rowVersion}`);
  for (const row of validKnowledgeRows) addSource("knowledge_version", row.id, `sha256:${row.contentSha256}`);
  for (const row of importRows) {
    if (!row.completedAt) throw new Error("Completed website import is missing completed_at.");
    addSource("website_import", row.id, `completed-at:${row.completedAt.toISOString()}`);
  }
  for (const row of gscRows) addSource("gsc_row", row.id, `sync-run:${row.syncRunId}`);
  for (const row of proofRows) addSource("ranking_proof", row.id, `row-version:${row.rowVersion}`);

  const sourceVersions = materialSources.map(sourceVersionWithIdentity);
  const initialQueries = buildOpportunityResearchQuerySeeds({
    services: serviceRows.map((row) => row.name),
    areas: areaRows.map((row) => row.name),
    gscQueries: gscRows.map((row) => row.query),
    knowledgeQueries: validKnowledgeRows.map((row) => row.title),
    maxQueries: 9
  });
  const evidencePacket = {
    profile: profileRow?.revision?.profileJson ?? null,
    profileRevisionId: profileRow?.revision?.id ?? null,
    services: serviceRows.map((row) => ({ id: row.id, name: row.name })),
    areas: areaRows.map((row) => ({ id: row.id, name: row.name, kind: row.kind })),
    knowledge: validKnowledgeRows.map((row) => ({
      id: row.id,
      documentKey: row.documentKey,
      version: row.version,
      title: row.title,
      bodyMarkdown: row.bodyMarkdown.slice(0, 2_000),
      contentSha256: row.contentSha256
    })),
    websiteImports: importRows.map((row) => ({
      id: row.id,
      sourceUrl: row.sourceUrl,
      completedAt: row.completedAt,
      summarySha256: canonicalSha256(row.summaryJson),
      summaryExcerpt: canonicalText(row.summaryJson).slice(0, 8_000)
    })),
    gsc: gscRows,
    rankingProofs: proofRows.map((row) => ({
      id: row.id,
      query: row.query,
      pageUrl: row.pageUrl,
      rank: row.rank,
      capturedAt: row.capturedAt,
      searchEngine: row.searchEngine,
      device: row.device,
      locale: row.locale
    })),
    existingRoutes: existingRoutes.map((row) => row.route),
    evidenceIndex: materialSources.map((source) => ({
      evidenceKey: source.evidenceKey,
      sourceKind: source.sourceKind,
      sourceId: source.sourceId
    }))
  };
  const evidencePacketSha256 = canonicalSha256(evidencePacket);
  const canonicalMaterial = canonicalizeOpportunityResearchMaterial({
    profileRevisionId: profileRow?.revision?.id ?? "00000000-0000-0000-0000-000000000000",
    serviceIds: serviceRows.map((row) => row.id),
    areaIds: areaRows.map((row) => row.id),
    sourceVersions,
    evidencePacketSha256,
    initialQueries
  });
  const materialDigest = sha256(canonicalMaterial);
  const packetBytes = Buffer.byteLength(JSON.stringify(evidencePacket), "utf8");
  if (packetBytes > OPPORTUNITY_RESEARCH_PACKET_MAX_BYTES) readinessIssues.push("evidence_packet_budget_exceeded");

  return {
    projectId,
    materialDigest,
    profileRevisionId: profileRow?.revision?.id,
    readinessIssues: [...new Set(readinessIssues)],
    initialQueries,
    evidencePacket,
    evidenceSources: materialSources,
    sourceVersions,
    paused: state?.pausedAt !== null && state?.pausedAt !== undefined,
    packetBytes
  };
}

function sourceVersionWithIdentity(source: OpportunityResearchMaterialSource): string {
  return `${source.sourceKind}:${source.sourceId}:${source.sourceVersion}`;
}

function canonicalSha256(value: unknown): string {
  return sha256(canonicalText(value));
}

function canonicalText(value: unknown): string {
  const text = canonicalize(value);
  if (text === undefined) throw new Error("Opportunity Research source could not be canonicalized.");
  return text;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function daysBefore(value: Date, days: number): Date {
  return new Date(value.getTime() - days * 24 * 60 * 60 * 1_000);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function firstPerKey<T>(rows: readonly T[], keyFor: (row: T) => string): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = keyFor(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
