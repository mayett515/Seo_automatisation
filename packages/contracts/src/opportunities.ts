import { z } from "zod";

import {
  AiReasoningAdapterFailureCodeSchema,
  AiReasoningEnqueueFailureCodeSchema,
  AiReasoningWorkflowFailureCodeSchema,
  aiReasoningRecoveryFailureCodes,
  AgentRunStatusSchema,
  EvidenceRefSchema,
  HttpUrlSchema,
  ProjectIdSchema,
  ReasoningTaskSchema
} from "./common.js";
import {
  AgentWorkflowNameSchema,
  OpportunityResearchAxesSchema,
  OpportunityResearchCandidateSchema,
  OpportunityResearchCitationSummarySchema,
  OpportunityResearchFailureCodeSchema
} from "./opportunity-research.js";
import { jobStatuses } from "./common.js";

export const opportunityClassifications = ["proven_win", "near_term_target", "internal_radar", "rejected"] as const;
export const opportunityLifecycleStatuses = ["new", "monitoring", "held", "rejected", "brief_created"] as const;
export const opportunityScoutQueueStatuses = [...jobStatuses, "already_active"] as const;

export const opportunityRecommendedActions = [
  "monitor",
  "create_brief",
  "create_page_proposal",
  "hold",
  "reject"
] as const;

export const opportunitySuggestedPageTypes = ["normal_page", "subdomain", "backlog", "monitor_only"] as const;

export const rankingProofDevices = ["desktop", "mobile"] as const;
export const rankingProofStatuses = ["captured", "reviewed", "invalidated"] as const;
export const rankingProofMaxAgeDays = 30 as const;

export const nearbyPlaceKinds = ["city", "district", "village", "municipality", "service_area"] as const;
export const nearbyPlaceAdjacencyReasons = [
  "near_existing_win",
  "same_corridor",
  "service_radius",
  "competitor_gap",
  "gsc_testing_signal",
  "manual_seed"
] as const;
export const clusterStrengths = ["none", "weak", "medium", "strong"] as const;
export const hubSpokeRoles = ["hub", "spoke", "standalone"] as const;
export const cannibalizationRiskLevels = ["none", "low", "medium", "high"] as const;
export const opportunityGroupSources = [
  "gsc_query_cluster",
  "gsc_page_cluster",
  "corridor_cluster",
  "agent_suggested",
  "user_defined"
] as const;

export const serpSnapshotStatuses = ["captured", "failed"] as const;
export const serpResultTypes = [
  "organic",
  "local_pack",
  "map_pack",
  "paid",
  "featured_snippet",
  "ai_overview",
  "people_also_ask",
  "video",
  "image",
  "other"
] as const;
export const serpFeatureTypes = [
  "local_pack",
  "map_pack",
  "featured_snippet",
  "ai_overview",
  "people_also_ask",
  "site_links",
  "reviews",
  "image_pack",
  "video_pack",
  "other"
] as const;
export const serpArtifactKinds = ["raw_json", "screenshot", "html", "markdown"] as const;
export const serpScoutFailureCodes = [
  "provider_not_configured",
  "provider_timeout",
  "provider_error",
  "provider_overloaded",
  "adapter_invalid_snapshot",
  "captcha_blocked",
  "policy_denied"
] as const;

export const OpportunityClassificationSchema = z.enum(opportunityClassifications);
export const OpportunityLifecycleStatusSchema = z.enum(opportunityLifecycleStatuses);
export const OpportunityScoutQueueStatusSchema = z.enum(opportunityScoutQueueStatuses);

export const OpportunityRecommendedActionSchema = z.enum(opportunityRecommendedActions);
export const OpportunitySuggestedPageTypeSchema = z.enum(opportunitySuggestedPageTypes);

export const RankingProofDeviceSchema = z.enum(rankingProofDevices);
export const RankingProofStatusSchema = z.enum(rankingProofStatuses);

export const NearbyPlaceKindSchema = z.enum(nearbyPlaceKinds);
export const NearbyPlaceAdjacencyReasonSchema = z.enum(nearbyPlaceAdjacencyReasons);
export const ClusterStrengthSchema = z.enum(clusterStrengths);
export const HubSpokeRoleSchema = z.enum(hubSpokeRoles);
export const CannibalizationRiskLevelSchema = z.enum(cannibalizationRiskLevels);
export const OpportunityGroupSourceSchema = z.enum(opportunityGroupSources);
export const SerpSnapshotStatusSchema = z.enum(serpSnapshotStatuses);
export const SerpResultTypeSchema = z.enum(serpResultTypes);
export const SerpFeatureTypeSchema = z.enum(serpFeatureTypes);
export const SerpArtifactKindSchema = z.enum(serpArtifactKinds);
export const SerpScoutFailureCodeSchema = z.enum(serpScoutFailureCodes);

export const CreateOpportunityScoutRunRequestSchema = z.object({
  maxBriefs: z.number().int().positive().max(12).optional()
});

export const OpportunityTargetRevisionSchema = z
  .object({
    status: OpportunityLifecycleStatusSchema,
    rowVersion: z.number().int().nonnegative().max(2_147_483_647)
  })
  .strict();

export const CreateRankingProofRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(200),
    pageUrl: HttpUrlSchema,
    rank: z.number().int().positive().max(100),
    capturedAt: z.string().datetime().optional(),
    searchEngine: z.string().trim().min(1).max(60).default("google"),
    device: RankingProofDeviceSchema.default("desktop"),
    locale: z.string().trim().min(1).max(100).optional(),
    notes: z.string().trim().min(1).max(2_000).optional()
  })
  .strict();

export const UpdateRankingProofStatusRequestSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("reviewed"),
      expectedStatus: z.literal("captured"),
      expectedRowVersion: z.number().int().nonnegative()
    })
    .strict(),
  z
    .object({
      status: z.literal("invalidated"),
      expectedStatus: z.literal("reviewed"),
      expectedRowVersion: z.number().int().nonnegative(),
      reason: z.string().trim().min(1).max(2_000)
    })
    .strict()
]);

export const SerpScoutRequestSchema = z
  .object({
    projectId: ProjectIdSchema,
    query: z.string().trim().min(1).max(200),
    searchEngine: z.string().trim().min(1).max(60).default("google"),
    device: RankingProofDeviceSchema.default("desktop"),
    locale: z.string().trim().min(1).max(100).optional(),
    region: z.string().trim().min(1).max(160).optional(),
    maxResults: z.number().int().positive().max(100).default(20)
  })
  .strict();

export const CreateSerpScoutRunRequestSchema = SerpScoutRequestSchema.omit({ projectId: true }).strict();

export type SerpCacheKeyInput = {
  query: string;
  searchEngine: string;
  device: string;
  locale?: string | null;
  region?: string | null;
};

export function buildSerpSnapshotCacheKey(input: SerpCacheKeyInput): string {
  return [
    input.searchEngine,
    input.device,
    input.locale ?? "default-locale",
    input.region ?? "default-region",
    input.query.trim().toLowerCase()
  ].join(":");
}

export const SerpSearchResultSchema = z
  .object({
    rank: z.number().int().positive().max(100),
    type: SerpResultTypeSchema,
    title: z.string().trim().min(1).max(300),
    url: HttpUrlSchema,
    displayUrl: z.string().trim().min(1).max(300).optional(),
    domain: z.string().trim().min(1).max(255),
    snippet: z.string().trim().min(1).max(1_000).optional()
  })
  .strict();

export const SerpFeatureSchema = z
  .object({
    type: SerpFeatureTypeSchema,
    label: z.string().trim().min(1).max(200),
    rank: z.number().int().positive().max(100).optional(),
    observed: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

export const SerpEngineErrorSchema = z
  .object({
    code: z.string().trim().min(1).max(120),
    message: z.string().trim().min(1).max(500).optional()
  })
  .strict();

export const SerpArtifactRefSchema = z
  .object({
    kind: SerpArtifactKindSchema,
    artifactKey: z.string().trim().min(1).max(500),
    contentHash: z.string().trim().min(1).max(160).optional()
  })
  .strict();

export const SerpSnapshotSchema = z
  .object({
    id: z.string().min(1),
    projectId: ProjectIdSchema,
    agentRunId: z.string().min(1).optional(),
    status: SerpSnapshotStatusSchema,
    query: z.string().trim().min(1).max(200),
    searchEngine: z.string().trim().min(1).max(60),
    device: RankingProofDeviceSchema,
    locale: z.string().trim().min(1).max(100).optional(),
    region: z.string().trim().min(1).max(160).optional(),
    cacheKey: z.string().trim().min(1).max(500),
    capturedAt: z.string().datetime(),
    provider: z.string().trim().min(1).max(120).optional(),
    results: z.array(SerpSearchResultSchema).max(100).default([]),
    serpFeatures: z.array(SerpFeatureSchema).max(50).default([]),
    engineErrors: z.array(SerpEngineErrorSchema).max(20).default([]),
    artifactRefs: z.array(SerpArtifactRefSchema).max(10).default([])
  })
  .strict();

export const UpdateOpportunityLifecycleRequestSchema = z
  .object({
    expectedStatus: OpportunityLifecycleStatusSchema,
    expectedRowVersion: z.number().int().nonnegative().max(2_147_483_647),
    status: OpportunityLifecycleStatusSchema.exclude(["brief_created"]),
    reason: z.string().trim().min(1).max(1_000).optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === "rejected" && !value.reason) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Rejecting an opportunity requires a reason."
      });
    }
  });

export const OpportunityGroupHintSchema = z
  .object({
    key: z.string().min(1).max(128),
    label: z.string().min(1).max(160),
    source: OpportunityGroupSourceSchema,
    description: z.string().min(1).max(700).optional(),
    evidence: z.array(EvidenceRefSchema).max(25).default([])
  })
  .strict();

export const NearbyPlaceCandidateSchema = z
  .object({
    name: z.string().min(1).max(160),
    kind: NearbyPlaceKindSchema,
    geo: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180)
      })
      .strict()
      .optional(),
    distanceKm: z.number().nonnegative().optional(),
    travelTimeMinutes: z.number().nonnegative().optional(),
    adjacencyReason: NearbyPlaceAdjacencyReasonSchema,
    existingClusterStrength: ClusterStrengthSchema,
    competitorWeakness: z.string().min(1).max(700).optional(),
    mapGroupKey: z.string().min(1).max(128).optional(),
    evidence: z.array(EvidenceRefSchema).max(25).default([])
  })
  .strict();

export const CorridorClusterSchema = z
  .object({
    name: z.string().min(1).max(160),
    hubPlace: z.string().min(1).max(160),
    places: z.array(z.string().min(1).max(160)).min(1).max(25),
    rationale: z.string().min(1).max(1_200),
    clusterStrength: ClusterStrengthSchema,
    recommendedSequence: z.array(z.string().min(1).max(160)).max(25).default([])
  })
  .strict();

export const CannibalizationRiskSchema = z
  .object({
    level: CannibalizationRiskLevelSchema,
    conflictingRoutes: z.array(z.string().min(1)).max(25).default([])
  })
  .strict();

export const CompetitorObservationSchema = z
  .object({
    url: z.string().url(),
    observation: z.string().min(1).max(1_000),
    gap: z.string().min(1).max(700).optional()
  })
  .strict();

export const OpportunityBriefSchema = z
  .object({
    projectId: ProjectIdSchema,
    classification: OpportunityClassificationSchema,
    service: z.string().min(1).max(160),
    location: NearbyPlaceCandidateSchema,
    primaryKeyword: z.string().min(1).max(200),
    secondaryKeywords: z.array(z.string().min(1).max(200)).max(15).default([]),
    suggestedRoute: z.string().min(1).optional(),
    suggestedPageType: OpportunitySuggestedPageTypeSchema,
    evidence: z.array(EvidenceRefSchema).min(1).max(25),
    competitorObservations: z.array(CompetitorObservationSchema).max(12).default([]),
    corridorCluster: CorridorClusterSchema.optional(),
    groupHints: z.array(OpportunityGroupHintSchema).max(12).default([]),
    hubSpokeRole: HubSpokeRoleSchema.optional(),
    uniquenessRationale: z.string().min(1).max(1_500).optional(),
    cannibalizationRisk: CannibalizationRiskSchema,
    missingEvidence: z.array(z.string().min(1).max(500)).max(20).default([]),
    confidence: z.number().min(0).max(1),
    rejectionReason: z.string().min(1).max(700).optional(),
    recommendedAction: OpportunityRecommendedActionSchema
  })
  .strict();

export const OpportunityScoutOutputSchema = z
  .object({
    briefs: z.array(OpportunityBriefSchema).max(12),
    groups: z.array(OpportunityGroupHintSchema).max(12).default([]),
    runNotes: z.string().min(1).max(2_000).optional()
  })
  .strict();

export const RankingProofSchema = z.object({
  id: z.string().min(1),
  projectId: ProjectIdSchema,
  query: z.string().min(1),
  pageUrl: HttpUrlSchema,
  rank: z.number().int().positive(),
  capturedAt: z.string().datetime(),
  searchEngine: z.string().min(1),
  device: RankingProofDeviceSchema,
  locale: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
  status: RankingProofStatusSchema,
  rowVersion: z.number().int().nonnegative(),
  reviewedAt: z.string().datetime().optional(),
  reviewedByUserId: z.string().uuid().optional(),
  invalidatedAt: z.string().datetime().optional(),
  invalidatedByUserId: z.string().min(1).optional(),
  invalidationReason: z.string().min(1).optional(),
  createdByUserId: z.string().min(1).optional(),
  createdAt: z.string().datetime()
});

export const RankingProofListResponseSchema = z.object({
  projectId: ProjectIdSchema,
  proofs: z.array(RankingProofSchema)
});

export const AgentRunFailureCodeSchema = z.union([
  AiReasoningAdapterFailureCodeSchema,
  AiReasoningWorkflowFailureCodeSchema,
  AiReasoningEnqueueFailureCodeSchema,
  OpportunityResearchFailureCodeSchema,
  z.enum(aiReasoningRecoveryFailureCodes),
  z.literal("operator_cancelled")
]);

export const OpportunityExplorerOpportunitySchema = z.object({
  id: z.string().min(1),
  projectId: ProjectIdSchema,
  agentRunId: z.string().min(1).optional(),
  areaId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  classification: OpportunityClassificationSchema.optional(),
  primaryKeyword: z.string().min(1),
  score: z.number().int().optional(),
  research: OpportunityResearchAxesSchema.extend({
    policyVersion: z.string().min(1),
    materialDigest: z.string().regex(/^[0-9a-f]{64}$/u),
    candidateKey: z.string().min(1),
    portfolioSelected: z.boolean(),
    portfolioOrder: z.number().int().min(1).max(8).optional(),
    candidate: OpportunityResearchCandidateSchema,
    citations: z.array(OpportunityResearchCitationSummarySchema).min(1).max(25)
  })
    .strict()
    .optional(),
  status: OpportunityLifecycleStatusSchema,
  rowVersion: z.number().int().nonnegative().max(2_147_483_647),
  statusReason: z.string().min(1).optional(),
  decidedByUserId: z.string().min(1).optional(),
  evidenceJson: OpportunityBriefSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const OpportunityExplorerListResponseSchema = z.object({
  projectId: ProjectIdSchema,
  opportunities: z.array(OpportunityExplorerOpportunitySchema)
});

export const AgentRunFailureSummarySchema = z.object({
  code: AgentRunFailureCodeSchema,
  gateId: z.string().min(1).optional(),
  message: z.string().min(1).optional()
});

export const AgentRunSummarySchema = z.object({
  id: z.string().min(1),
  projectId: ProjectIdSchema,
  subjectId: z.string().min(1).optional(),
  task: ReasoningTaskSchema,
  workflowName: AgentWorkflowNameSchema.optional(),
  workflowVersion: z.string().min(1).max(80).optional(),
  constraintProfileVersion: z.string().min(1).max(80).optional(),
  status: AgentRunStatusSchema,
  failureCode: AgentRunFailureCodeSchema.optional(),
  failure: AgentRunFailureSummarySchema.optional(),
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  opportunityCount: z.number().int().nonnegative(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const AgentRunListResponseSchema = z.object({
  projectId: ProjectIdSchema,
  runs: z.array(AgentRunSummarySchema)
});

export type CreateOpportunityScoutRunRequest = z.output<typeof CreateOpportunityScoutRunRequestSchema>;
export type OpportunityTargetRevision = z.output<typeof OpportunityTargetRevisionSchema>;
export type CreateRankingProofRequest = z.output<typeof CreateRankingProofRequestSchema>;
export type UpdateRankingProofStatusRequest = z.output<typeof UpdateRankingProofStatusRequestSchema>;
export type SerpScoutRequest = z.output<typeof SerpScoutRequestSchema>;
export type CreateSerpScoutRunRequest = z.output<typeof CreateSerpScoutRunRequestSchema>;
export type SerpSearchResult = z.output<typeof SerpSearchResultSchema>;
export type SerpFeature = z.output<typeof SerpFeatureSchema>;
export type SerpEngineError = z.output<typeof SerpEngineErrorSchema>;
export type SerpArtifactRef = z.output<typeof SerpArtifactRefSchema>;
export type SerpSnapshot = z.output<typeof SerpSnapshotSchema>;
export type UpdateOpportunityLifecycleRequest = z.output<typeof UpdateOpportunityLifecycleRequestSchema>;
export type OpportunityGroupHint = z.output<typeof OpportunityGroupHintSchema>;
export type NearbyPlaceCandidate = z.output<typeof NearbyPlaceCandidateSchema>;
export type CorridorCluster = z.output<typeof CorridorClusterSchema>;
export type OpportunityBrief = z.output<typeof OpportunityBriefSchema>;
export type OpportunityScoutOutput = z.output<typeof OpportunityScoutOutputSchema>;
export type RankingProof = z.output<typeof RankingProofSchema>;
export type RankingProofListResponse = z.output<typeof RankingProofListResponseSchema>;
export type AgentRunFailureCode = z.output<typeof AgentRunFailureCodeSchema>;
export type OpportunityLifecycleStatus = z.output<typeof OpportunityLifecycleStatusSchema>;
export type OpportunityScoutQueueStatus = z.output<typeof OpportunityScoutQueueStatusSchema>;
export type OpportunityExplorerOpportunity = z.output<typeof OpportunityExplorerOpportunitySchema>;
export type OpportunityExplorerListResponse = z.output<typeof OpportunityExplorerListResponseSchema>;
export type AgentRunFailureSummary = z.output<typeof AgentRunFailureSummarySchema>;
export type AgentRunSummary = z.output<typeof AgentRunSummarySchema>;
export type AgentRunListResponse = z.output<typeof AgentRunListResponseSchema>;
export type OpportunityClassification = z.output<typeof OpportunityClassificationSchema>;
export type OpportunityRecommendedAction = z.output<typeof OpportunityRecommendedActionSchema>;
export type OpportunitySuggestedPageType = z.output<typeof OpportunitySuggestedPageTypeSchema>;
export type RankingProofDevice = z.output<typeof RankingProofDeviceSchema>;
export type RankingProofStatus = z.output<typeof RankingProofStatusSchema>;
export type OpportunityGroupSource = z.output<typeof OpportunityGroupSourceSchema>;
export type SerpSnapshotStatus = z.output<typeof SerpSnapshotStatusSchema>;
export type SerpResultType = z.output<typeof SerpResultTypeSchema>;
export type SerpFeatureType = z.output<typeof SerpFeatureTypeSchema>;
export type SerpArtifactKind = z.output<typeof SerpArtifactKindSchema>;
export type SerpScoutFailureCode = z.output<typeof SerpScoutFailureCodeSchema>;
