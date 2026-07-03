import { z } from "zod";

export const jobStatuses = [
  "queued",
  "running",
  "waiting_for_external",
  "waiting_for_approval",
  "dry_run",
  "completed",
  "failed",
  "cancelled",
  "retrying"
] as const;

export const jobTypes = [
  "pre_audit",
  "website_import",
  "opportunity_scout",
  "local_analysis",
  "page_generation",
  "seo_qa",
  "deployment_agent_preflight",
  "deploy",
  "gsc_sync",
  "analytics",
  "report",
  "notification",
  "rollback"
] as const;

export const queueNames = [
  "pre-audit",
  "website-import",
  "opportunity-scout",
  "local-analysis",
  "page-generation",
  "seo-qa",
  "deploy",
  "rollback",
  "gsc-sync",
  "analytics",
  "report",
  "notifications"
] as const;

export const trackingEventNames = [
  "page_view",
  "scroll_25",
  "scroll_50",
  "scroll_75",
  "scroll_90",
  "time_30_seconds",
  "cta_visible",
  "cta_click",
  "phone_click",
  "whatsapp_click",
  "email_click",
  "form_start",
  "form_submit",
  "map_click",
  "faq_open",
  "gallery_open",
  "service_card_click"
] as const;

export const domainEventNames = [
  "LeadCreated",
  "PreAuditQueued",
  "PotentialReportGenerated",
  "ProjectCreated",
  "MainWebsiteImported",
  "PageVersionApproved",
  "SubdomainDeployed",
  "GscPerformanceSynced",
  "ReportGenerated",
  "CustomerApprovedNextAction"
] as const;

export const releasePlanStatuses = [
  "draft",
  "ready",
  "ready_with_warnings",
  "blocked",
  "approved_for_deploy",
  "deploying",
  "live",
  "failed",
  "rolled_back"
] as const;

export const deploymentStatuses = [
  "pending",
  "deploying",
  "provider_succeeded",
  "verifying",
  "live_healthy",
  "live_with_warnings",
  "rollback_recommended",
  "failed",
  "rollback_pending",
  "rolled_back"
] as const;

export const providerOperationStatuses = [
  "not_started",
  "in_flight",
  "recorded",
  "failed",
  "manual_reconciliation_required"
] as const;

export const releaseVerificationStatuses = [
  "not_started",
  "running",
  "live_healthy",
  "live_with_warnings",
  "rollback_recommended",
  "execution_failed",
  "failed"
] as const;

export const gscConnectionStatuses = ["connection_required", "connected", "error", "revoked"] as const;

export const gscSyncStatuses = ["queued", "running", "completed", "failed", "cancelled"] as const;

export const websiteImportStatuses = ["queued", "running", "completed", "failed"] as const;

export const gscOpportunitySignalTypes = [
  "impressions_no_clicks",
  "positions_11_100",
  "wrong_page_service_location",
  "service_location_query"
] as const;

export const gscOpportunitySignalStatuses = ["internal_radar", "near_term_target", "rejected", "promoted"] as const;

export const reasoningTasks = [
  "opportunity_scout",
  "page_brief_draft",
  "section_text_generation",
  "report_narrative"
] as const;

export const agentRunStatuses = ["queued", "running", "succeeded", "failed"] as const;

export const aiReasoningAdapterFailureCodes = [
  "provider_timeout",
  "provider_error",
  "provider_not_configured",
  "provider_overloaded",
  "output_not_json",
  "budget_exceeded",
  "policy_violation"
] as const;

export const aiReasoningWorkflowFailureCodes = ["output_schema_mismatch", "qa_rejected"] as const;
export const aiReasoningEnqueueFailureCodes = ["queue_enqueue_failed", "queue_not_configured"] as const;

export const opportunityClassifications = ["proven_win", "near_term_target", "internal_radar", "rejected"] as const;
export const opportunityScoutQueueStatuses = [...jobStatuses, "already_active"] as const;

export const opportunityRecommendedActions = [
  "monitor",
  "create_brief",
  "create_page_proposal",
  "hold",
  "reject"
] as const;

export const opportunitySuggestedPageTypes = ["normal_page", "subdomain", "backlog", "monitor_only"] as const;

export const evidenceSourceTypes = [
  "website_import",
  "gsc_signal",
  "gsc_row",
  "serp_snapshot",
  "competitor_snapshot",
  "tracking",
  "field_evidence",
  "manual_note",
  "existing_page",
  "ranking_proof",
  "customer_memory"
] as const;

export const evidenceStrengths = ["weak", "medium", "strong"] as const;
export const evidenceProofTiers = ["internal_signal", "supporting_context", "customer_safe_proof"] as const;
export const rankingProofDevices = ["desktop", "mobile"] as const;
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

export const approvalStatuses = ["pending", "approved", "rejected", "held"] as const;
export const releaseCheckSeverities = ["info", "warning", "blocker"] as const;
export const releaseCheckResults = ["passed", "failed", "skipped"] as const;
export const releaseItemActions = ["create", "update", "redirect", "noindex", "remove"] as const;
export const releaseNoteAudiences = ["internal", "customer"] as const;
export const customerMembershipRoles = ["owner", "admin", "editor", "viewer"] as const;

export const ProjectIdSchema = z.string().min(1);
export const LeadIdSchema = z.string().min(1);
export const JobStatusSchema = z.enum(jobStatuses);
export const JobTypeSchema = z.enum(jobTypes);
export const QueueNameSchema = z.enum(queueNames);
export const TrackingEventNameSchema = z.enum(trackingEventNames);
export const DomainEventNameSchema = z.enum(domainEventNames);
export const ReleasePlanStatusSchema = z.enum(releasePlanStatuses);
export const DeploymentStatusSchema = z.enum(deploymentStatuses);
export const ProviderOperationStatusSchema = z.enum(providerOperationStatuses);
export const ReleaseVerificationStatusSchema = z.enum(releaseVerificationStatuses);
export const GscConnectionStatusSchema = z.enum(gscConnectionStatuses);
export const GscSyncStatusSchema = z.enum(gscSyncStatuses);
export const WebsiteImportStatusSchema = z.enum(websiteImportStatuses);
export const GscOpportunitySignalTypeSchema = z.enum(gscOpportunitySignalTypes);
export const GscOpportunitySignalStatusSchema = z.enum(gscOpportunitySignalStatuses);
export const ReasoningTaskSchema = z.enum(reasoningTasks);
export const AgentRunStatusSchema = z.enum(agentRunStatuses);
export const AiReasoningAdapterFailureCodeSchema = z.enum(aiReasoningAdapterFailureCodes);
export const AiReasoningWorkflowFailureCodeSchema = z.enum(aiReasoningWorkflowFailureCodes);
export const AiReasoningEnqueueFailureCodeSchema = z.enum(aiReasoningEnqueueFailureCodes);
export const OpportunityClassificationSchema = z.enum(opportunityClassifications);
export const OpportunityScoutQueueStatusSchema = z.enum(opportunityScoutQueueStatuses);
export const OpportunityRecommendedActionSchema = z.enum(opportunityRecommendedActions);
export const OpportunitySuggestedPageTypeSchema = z.enum(opportunitySuggestedPageTypes);
export const EvidenceSourceTypeSchema = z.enum(evidenceSourceTypes);
export const EvidenceStrengthSchema = z.enum(evidenceStrengths);
export const EvidenceProofTierSchema = z.enum(evidenceProofTiers);
export const RankingProofDeviceSchema = z.enum(rankingProofDevices);
export const NearbyPlaceKindSchema = z.enum(nearbyPlaceKinds);
export const NearbyPlaceAdjacencyReasonSchema = z.enum(nearbyPlaceAdjacencyReasons);
export const ClusterStrengthSchema = z.enum(clusterStrengths);
export const HubSpokeRoleSchema = z.enum(hubSpokeRoles);
export const CannibalizationRiskLevelSchema = z.enum(cannibalizationRiskLevels);
export const OpportunityGroupSourceSchema = z.enum(opportunityGroupSources);
export const ApprovalStatusSchema = z.enum(approvalStatuses);
export const CustomerMembershipRoleSchema = z.enum(customerMembershipRoles);

export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const DateRangeSchema = z.object({
  from: IsoDateSchema,
  to: IsoDateSchema
});

export const GscPropertyUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) => value.startsWith("sc-domain:") || /^https?:\/\/.+/u.test(value),
    "Expected a Search Console URL-prefix property or sc-domain property"
  );

export const CreateLeadSchema = z.object({
  websiteUrl: z.string().url(),
  businessName: z.string().min(1).optional(),
  services: z.array(z.string().min(1)).default([]),
  targetAreas: z.array(z.string().min(1)).default([]),
  averageOrderValue: z.number().positive().optional()
});

export const LeadSchema = CreateLeadSchema.extend({
  id: z.string().min(1),
  status: z.enum(["new", "converted", "archived"]),
  createdAt: z.string().datetime()
});

export const PotentialReportSchema = z.object({
  leadId: LeadIdSchema,
  status: z.enum(["draft", "queued", "ready"]),
  headline: z.string().min(1),
  ranges: z.array(z.string().min(1))
});

export const ProjectSummarySchema = z.object({
  id: ProjectIdSchema,
  name: z.string().min(1),
  status: z.string().min(1),
  nextAction: z.string().min(1)
});

export const MainPreviewSchema = z.object({
  projectId: ProjectIdSchema,
  previewUrl: z.string().url(),
  robots: z.enum(["noindex", "index"])
});

export const WebsiteImportSourceUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Website import source URLs must use http or https.");

export const CreateWebsiteImportRequestSchema = z.object({
  sourceUrl: WebsiteImportSourceUrlSchema
});

export const CreateOpportunityScoutRunRequestSchema = z.object({
  maxBriefs: z.number().int().positive().max(12).optional()
});

export const HttpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Expected an http(s) URL.");

export const CreateRankingProofRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(200),
    pageUrl: HttpUrlSchema,
    rank: z.number().int().positive().max(100),
    capturedAt: z.string().datetime().optional(),
    searchEngine: z.string().trim().min(1).max(60).default("google"),
    device: RankingProofDeviceSchema.default("desktop"),
    locale: z.string().trim().min(1).max(100).optional(),
    screenshotArtifactKey: z.string().trim().min(1).max(500).optional(),
    notes: z.string().trim().min(1).max(2_000).optional()
  })
  .strict();

export const QueueJobSchema = z.object({
  jobId: z.string().min(1),
  projectId: ProjectIdSchema.optional(),
  leadId: LeadIdSchema.optional(),
  releasePlanId: z.string().min(1).optional(),
  type: JobTypeSchema,
  status: JobStatusSchema,
  inputRef: z.string().min(1).optional(),
  createdBy: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  createdAt: z.string().datetime()
});

export const DeployJobDataSchema = z.object({
  projectId: ProjectIdSchema,
  releasePlanId: z.string().min(1),
  deploymentKey: z.string().min(1),
  maxAttempts: z.number().int().positive().optional(),
  jobRunId: z.string().min(1).optional(),
  triggeredByUserId: z.string().min(1).nullable().optional(),
  triggerSource: z.string().min(1).optional()
});

export const RollbackJobDataSchema = z.object({
  projectId: ProjectIdSchema,
  releasePlanId: z.string().min(1),
  deploymentId: z.string().min(1),
  rollbackPointId: z.string().min(1),
  maxAttempts: z.number().int().positive().optional(),
  jobRunId: z.string().min(1).optional(),
  triggeredByUserId: z.string().min(1).nullable().optional(),
  triggerSource: z.string().min(1).optional()
});

export const WebsiteImportJobDataSchema = z.object({
  projectId: ProjectIdSchema,
  importRunId: z.string().min(1),
  sourceUrl: WebsiteImportSourceUrlSchema,
  maxAttempts: z.number().int().positive().optional(),
  jobRunId: z.string().min(1).optional(),
  triggeredByUserId: z.string().min(1).nullable().optional(),
  triggerSource: z.string().min(1).optional()
});

export const OpportunityScoutJobDataSchema = z.object({
  projectId: ProjectIdSchema,
  runId: z.string().min(1),
  maxBriefs: z.number().int().positive().max(12).optional(),
  maxAttempts: z.number().int().positive().optional(),
  jobRunId: z.string().min(1).optional(),
  triggeredByUserId: z.string().min(1).nullable().optional(),
  triggerSource: z.string().min(1).optional()
});

export const ApprovedReleaseArtifactPageSchema = z.object({
  releasePlanItemId: z.string().min(1),
  pageVersionId: z.string().min(1).nullable(),
  targetUrl: z.string().min(1),
  targetSubdomain: z.string().min(1).nullable(),
  action: z.string().min(1),
  pageJson: z.record(z.string(), z.unknown())
});

export const ApprovedReleaseArtifactSchema = z.object({
  projectId: ProjectIdSchema,
  releasePlanId: z.string().min(1),
  deploymentKey: z.string().min(1),
  createdAt: z.string().datetime(),
  pages: z.array(ApprovedReleaseArtifactPageSchema).min(1)
});

export const PageProposalSchema = z.object({
  projectId: ProjectIdSchema,
  service: z.string().min(1),
  location: z.string().min(1),
  route: z.string().min(1),
  primaryKeyword: z.string().min(1),
  secondaryKeywords: z.array(z.string().min(1)).default([]),
  internalLinks: z.array(z.string().min(1)).default([]),
  proofSource: z.string().min(1).optional(),
  uniquenessRationale: z.string().min(1),
  sitemapReady: z.boolean().default(false)
});

export const ReleaseCheckSchema = z.object({
  checkKey: z.string().min(1),
  scope: z.enum(["page", "project", "domain", "sitemap", "tracking", "gsc"]),
  severity: z.enum(releaseCheckSeverities),
  result: z.enum(releaseCheckResults),
  message: z.string().min(1),
  evidence: z.record(z.string(), z.unknown()).optional()
});

export const ReleasePlanSchema = z.object({
  releasePlanId: z.string().min(1),
  projectId: ProjectIdSchema,
  status: ReleasePlanStatusSchema,
  riskLevel: z.enum(["low", "medium", "high"]),
  blockerCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative()
});

export const ReleaseVerificationSchema = z.object({
  releasePlanId: z.string().min(1),
  deploymentId: z.string().min(1).optional(),
  verificationStatus: ReleaseVerificationStatusSchema,
  summary: z.string().min(1),
  checkedAt: z.string().datetime(),
  checks: z.array(ReleaseCheckSchema)
});

export const ReleaseVerificationCheckSchema = ReleaseCheckSchema.extend({
  verificationId: z.string().min(1).optional(),
  targetUrl: z.string().min(1).optional(),
  expected: z.record(z.string(), z.unknown()).optional(),
  observed: z.record(z.string(), z.unknown()).optional(),
  checkedAt: z.string().datetime()
});

export const ReleaseNoteSchema = z.object({
  releasePlanId: z.string().min(1),
  audience: z.enum(releaseNoteAudiences).default("internal"),
  title: z.string().min(1),
  body: z.string().min(1),
  createdAt: z.string().datetime()
});

export const RollbackPointSchema = z.object({
  releasePlanId: z.string().min(1),
  deploymentId: z.string().min(1).optional(),
  artifactKey: z.string().min(1),
  providerDeployId: z.string().min(1).optional(),
  liveUrl: z.string().url().optional(),
  evidence: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime()
});

export const GscConnectionSchema = z.object({
  projectId: ProjectIdSchema,
  status: GscConnectionStatusSchema,
  propertyUrl: GscPropertyUrlSchema.optional(),
  lastSyncedAt: z.string().datetime().optional(),
  message: z.string().min(1).optional()
});

export const GscOAuthIntentSchema = z.object({
  projectId: ProjectIdSchema,
  status: z.literal("connection_required"),
  provider: z.literal("google_search_console"),
  authUrl: z.string().url().optional(),
  expiresAt: z.string().datetime().optional(),
  scopes: z.array(z.string().min(1)).default([]),
  message: z.string().min(1)
});

export const GscOAuthCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().min(1).optional()
});

export const GscPropertySchema = z.object({
  siteUrl: GscPropertyUrlSchema,
  permissionLevel: z.string().min(1)
});

export const GscPropertyListSchema = z.object({
  projectId: ProjectIdSchema,
  properties: z.array(GscPropertySchema)
});

export const GscSyncRequestSchema = z.object({
  dateRange: DateRangeSchema.optional(),
  propertyUrl: GscPropertyUrlSchema.optional()
});

export const GscSyncRunSchema = z.object({
  syncRunId: z.string().min(1),
  projectId: ProjectIdSchema,
  connectionId: z.string().min(1).optional(),
  propertyUrl: GscPropertyUrlSchema,
  dateRange: DateRangeSchema,
  dimensions: z.array(z.string().min(1)),
  status: GscSyncStatusSchema,
  rowCount: z.number().int().nonnegative().default(0),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  message: z.string().min(1).optional()
});

export const WebsiteImportRunSchema = z.object({
  importRunId: z.string().min(1),
  projectId: ProjectIdSchema,
  sourceUrl: WebsiteImportSourceUrlSchema,
  status: WebsiteImportStatusSchema,
  artifactKey: z.string().min(1).optional(),
  pageCount: z.number().int().nonnegative().default(0),
  discoveredRoutes: z.array(z.string().min(1)).default([]),
  facts: z
    .object({
      brand: z
        .object({
          name: z.string().min(1),
          confidence: z.enum(["low", "medium", "high"]),
          sourceRoutes: z.array(z.string().min(1)).default([])
        })
        .optional(),
      services: z
        .array(
          z.object({
            value: z.string().min(1),
            confidence: z.enum(["low", "medium", "high"]),
            sourceRoutes: z.array(z.string().min(1)).default([])
          })
        )
        .default([]),
      areas: z
        .array(
          z.object({
            value: z.string().min(1),
            confidence: z.enum(["low", "medium", "high"]),
            sourceRoutes: z.array(z.string().min(1)).default([])
          })
        )
        .default([])
    })
    .optional(),
  message: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional()
});

export const LatestWebsiteImportResponseSchema = z.object({
  projectId: ProjectIdSchema,
  importRun: WebsiteImportRunSchema.optional()
});

export const GscSearchAnalyticsRowSchema = z.object({
  syncRunId: z.string().min(1).optional(),
  projectId: ProjectIdSchema,
  propertyUrl: GscPropertyUrlSchema,
  query: z.string().min(1),
  pageUrl: z.string().url(),
  clicks: z.number().nonnegative(),
  impressions: z.number().nonnegative(),
  ctr: z.number().min(0).max(1),
  position: z.number().nonnegative()
});

export const GscOpportunitySignalSchema = z.object({
  projectId: ProjectIdSchema,
  syncRunId: z.string().min(1),
  rowId: z.string().min(1).optional(),
  signalType: GscOpportunitySignalTypeSchema,
  status: GscOpportunitySignalStatusSchema.default("internal_radar"),
  query: z.string().min(1),
  pageUrl: z.string().url(),
  evidence: z.record(z.string(), z.unknown()).optional()
});

export const EvidenceLocatorSchema = z
  .object({
    url: z.string().url().optional(),
    route: z.string().min(1).optional(),
    query: z.string().min(1).optional(),
    pageUrl: z.string().url().optional(),
    sectionId: z.string().min(1).optional()
  })
  .strict();

export const EvidenceObservedMetricSchema = z
  .object({
    name: z.string().min(1),
    value: z.union([z.string().min(1), z.number()]),
    unit: z.string().min(1).optional()
  })
  .strict();

export const EvidenceRefSchema = z
  .object({
    sourceType: EvidenceSourceTypeSchema,
    sourceId: z.string().min(1).optional(),
    locator: EvidenceLocatorSchema.optional(),
    dateRange: DateRangeSchema.optional(),
    summary: z.string().min(1).max(1_000),
    excerpt: z.string().min(1).max(500).optional(),
    observedMetric: EvidenceObservedMetricSchema.optional(),
    strength: EvidenceStrengthSchema,
    proofTier: EvidenceProofTierSchema
  })
  .strict();

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

export const GscPerformanceSummarySchema = z.object({
  projectId: ProjectIdSchema,
  connection: GscConnectionSchema,
  latestSync: GscSyncRunSchema.optional(),
  rows: z.array(GscSearchAnalyticsRowSchema).default([]),
  opportunitySignals: z.array(GscOpportunitySignalSchema).default([])
});

export const GscUrlInspectionResultSchema = z.object({
  siteUrl: GscPropertyUrlSchema,
  inspectionUrl: z.string().url(),
  verdict: z.string().min(1).optional(),
  coverageState: z.string().min(1).optional(),
  checkedAt: z.string().datetime(),
  raw: z.record(z.string(), z.unknown()).optional()
});

export const GscSitemapSubmissionSchema = z.object({
  projectId: ProjectIdSchema,
  propertyUrl: GscPropertyUrlSchema,
  sitemapUrl: z.string().url(),
  submittedAt: z.string().datetime()
});

export const TrackingEventSchema = z.object({
  eventName: TrackingEventNameSchema,
  projectId: ProjectIdSchema,
  pageId: z.string().min(1).max(128).optional(),
  route: z
    .string()
    .min(1)
    .max(2048)
    .refine((value) => value.startsWith("/"), "Expected a path-only route starting with /"),
  componentId: z.string().min(1).max(128).optional(),
  occurredAt: z.string().datetime().optional()
});

export const TrackingIngestResultSchema = z.object({
  accepted: z.boolean(),
  eventName: TrackingEventNameSchema,
  occurredAt: z.string().datetime(),
  persisted: z.boolean().default(false),
  mode: z.enum(["persisted", "dry_run"]).default("dry_run")
});

export const TrackingAllowedOriginSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Tracking allowed origins must use http or https.")
  .transform((value) => new URL(value).origin);

export const CreateTrackingKeyRequestSchema = z.object({
  allowedOrigins: z.array(TrackingAllowedOriginSchema).min(1)
});

export const TrackingKeySummarySchema = z.object({
  keyId: z.string().min(1),
  projectId: ProjectIdSchema,
  status: z.enum(["active", "revoked"]),
  allowedOrigins: z.array(TrackingAllowedOriginSchema),
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime().optional(),
  revokedAt: z.string().datetime().optional()
});

export const CreateTrackingKeyResponseSchema = TrackingKeySummarySchema.extend({
  trackingKey: z.string().min(32)
});

export const CreateReleasePlanRequestSchema = z.object({
  pageVersionIds: z.array(z.string().min(1)).default([])
});

export const VerifyReleaseRequestSchema = z.object({
  deploymentId: z.string().min(1).optional()
});

export const ExecuteRollbackRequestSchema = z.object({
  rollbackPointId: z.string().min(1)
});

export const HealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded", "down"]),
  service: z.string().min(1),
  stack: z.object({
    http: z.string().min(1),
    workers: z.string().min(1),
    ai: z.string().min(1)
  })
});

export const HealthProbeResponseSchema = HealthResponseSchema.extend({
  probe: z.enum(["liveness", "readiness"]),
  dependencies: z
    .object({
      database: z.enum(["up", "down", "not_configured"]),
      redis: z.enum(["up", "down", "not_configured"])
    })
    .optional()
});

export const GscSyncQueueResponseSchema = z.union([QueueJobSchema, GscConnectionSchema]);
export const WebsiteImportQueueResponseSchema = QueueJobSchema.extend({
  importRunId: z.string().min(1).optional(),
  sourceUrl: WebsiteImportSourceUrlSchema.optional()
});
export const OpportunityScoutQueueResponseSchema = QueueJobSchema.extend({
  status: OpportunityScoutQueueStatusSchema,
  runId: z.string().min(1).optional()
});

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
  screenshotArtifactKey: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
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
  AiReasoningEnqueueFailureCodeSchema
]);

export const OpportunityExplorerOpportunitySchema = z.object({
  id: z.string().min(1),
  projectId: ProjectIdSchema,
  agentRunId: z.string().min(1).optional(),
  classification: OpportunityClassificationSchema,
  primaryKeyword: z.string().min(1),
  score: z.number().int(),
  status: z.string().min(1),
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
  task: ReasoningTaskSchema,
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

export type CreateLeadInput = z.output<typeof CreateLeadSchema>;
export type Lead = z.output<typeof LeadSchema>;
export type PotentialReport = z.output<typeof PotentialReportSchema>;
export type ProjectSummary = z.output<typeof ProjectSummarySchema>;
export type MainPreview = z.output<typeof MainPreviewSchema>;
export type QueueJob = z.output<typeof QueueJobSchema>;
export type DeployJobData = z.output<typeof DeployJobDataSchema>;
export type RollbackJobData = z.output<typeof RollbackJobDataSchema>;
export type WebsiteImportJobData = z.output<typeof WebsiteImportJobDataSchema>;
export type OpportunityScoutJobData = z.output<typeof OpportunityScoutJobDataSchema>;
export type ApprovedReleaseArtifact = z.output<typeof ApprovedReleaseArtifactSchema>;
export type ApprovedReleaseArtifactPage = z.output<typeof ApprovedReleaseArtifactPageSchema>;
export type QueueName = z.output<typeof QueueNameSchema>;
export type PageProposal = z.output<typeof PageProposalSchema>;
export type ReleaseCheck = z.output<typeof ReleaseCheckSchema>;
export type ReleasePlan = z.output<typeof ReleasePlanSchema>;
export type ReleaseVerification = z.output<typeof ReleaseVerificationSchema>;
export type ReleaseVerificationCheck = z.output<typeof ReleaseVerificationCheckSchema>;
export type ReleaseNote = z.output<typeof ReleaseNoteSchema>;
export type RollbackPoint = z.output<typeof RollbackPointSchema>;
export type GscConnection = z.output<typeof GscConnectionSchema>;
export type GscOAuthIntent = z.output<typeof GscOAuthIntentSchema>;
export type GscOAuthCallbackQuery = z.output<typeof GscOAuthCallbackQuerySchema>;
export type GscProperty = z.output<typeof GscPropertySchema>;
export type GscPropertyList = z.output<typeof GscPropertyListSchema>;
export type GscSyncRequest = z.output<typeof GscSyncRequestSchema>;
export type GscSyncRun = z.output<typeof GscSyncRunSchema>;
export type WebsiteImportRun = z.output<typeof WebsiteImportRunSchema>;
export type LatestWebsiteImportResponse = z.output<typeof LatestWebsiteImportResponseSchema>;
export type CreateOpportunityScoutRunRequest = z.output<typeof CreateOpportunityScoutRunRequestSchema>;
export type CreateRankingProofRequest = z.output<typeof CreateRankingProofRequestSchema>;
export type GscSearchAnalyticsRow = z.output<typeof GscSearchAnalyticsRowSchema>;
export type GscOpportunitySignal = z.output<typeof GscOpportunitySignalSchema>;
export type EvidenceRef = z.output<typeof EvidenceRefSchema>;
export type OpportunityGroupHint = z.output<typeof OpportunityGroupHintSchema>;
export type NearbyPlaceCandidate = z.output<typeof NearbyPlaceCandidateSchema>;
export type CorridorCluster = z.output<typeof CorridorClusterSchema>;
export type OpportunityBrief = z.output<typeof OpportunityBriefSchema>;
export type OpportunityScoutOutput = z.output<typeof OpportunityScoutOutputSchema>;
export type GscPerformanceSummary = z.output<typeof GscPerformanceSummarySchema>;
export type GscUrlInspectionResult = z.output<typeof GscUrlInspectionResultSchema>;
export type GscSitemapSubmission = z.output<typeof GscSitemapSubmissionSchema>;
export type TrackingEvent = z.output<typeof TrackingEventSchema>;
export type TrackingIngestResult = z.output<typeof TrackingIngestResultSchema>;
export type CreateTrackingKeyRequest = z.output<typeof CreateTrackingKeyRequestSchema>;
export type TrackingKeySummary = z.output<typeof TrackingKeySummarySchema>;
export type CreateTrackingKeyResponse = z.output<typeof CreateTrackingKeyResponseSchema>;
export type CreateReleasePlanRequest = z.output<typeof CreateReleasePlanRequestSchema>;
export type VerifyReleaseRequest = z.output<typeof VerifyReleaseRequestSchema>;
export type ExecuteRollbackRequest = z.output<typeof ExecuteRollbackRequestSchema>;
export type HealthResponse = z.output<typeof HealthResponseSchema>;
export type HealthProbeResponse = z.output<typeof HealthProbeResponseSchema>;
export type GscSyncQueueResponse = z.output<typeof GscSyncQueueResponseSchema>;
export type WebsiteImportQueueResponse = z.output<typeof WebsiteImportQueueResponseSchema>;
export type OpportunityScoutQueueResponse = z.output<typeof OpportunityScoutQueueResponseSchema>;
export type RankingProof = z.output<typeof RankingProofSchema>;
export type RankingProofListResponse = z.output<typeof RankingProofListResponseSchema>;
export type AiReasoningEnqueueFailureCode = z.output<typeof AiReasoningEnqueueFailureCodeSchema>;
export type AgentRunFailureCode = z.output<typeof AgentRunFailureCodeSchema>;
export type OpportunityScoutQueueStatus = z.output<typeof OpportunityScoutQueueStatusSchema>;
export type OpportunityExplorerOpportunity = z.output<typeof OpportunityExplorerOpportunitySchema>;
export type OpportunityExplorerListResponse = z.output<typeof OpportunityExplorerListResponseSchema>;
export type AgentRunFailureSummary = z.output<typeof AgentRunFailureSummarySchema>;
export type AgentRunSummary = z.output<typeof AgentRunSummarySchema>;
export type AgentRunListResponse = z.output<typeof AgentRunListResponseSchema>;
export type JobStatus = z.output<typeof JobStatusSchema>;
export type JobType = z.output<typeof JobTypeSchema>;
export type DomainEventName = z.output<typeof DomainEventNameSchema>;
export type ReleasePlanStatus = z.output<typeof ReleasePlanStatusSchema>;
export type DeploymentStatus = z.output<typeof DeploymentStatusSchema>;
export type ProviderOperationStatus = z.output<typeof ProviderOperationStatusSchema>;
export type ReleaseVerificationStatus = z.output<typeof ReleaseVerificationStatusSchema>;
export type GscConnectionStatus = z.output<typeof GscConnectionStatusSchema>;
export type GscSyncStatus = z.output<typeof GscSyncStatusSchema>;
export type WebsiteImportStatus = z.output<typeof WebsiteImportStatusSchema>;
export type GscOpportunitySignalType = z.output<typeof GscOpportunitySignalTypeSchema>;
export type GscOpportunitySignalStatus = z.output<typeof GscOpportunitySignalStatusSchema>;
export type ReasoningTask = z.output<typeof ReasoningTaskSchema>;
export type AgentRunStatus = z.output<typeof AgentRunStatusSchema>;
export type AiReasoningAdapterFailureCode = z.output<typeof AiReasoningAdapterFailureCodeSchema>;
export type AiReasoningWorkflowFailureCode = z.output<typeof AiReasoningWorkflowFailureCodeSchema>;
export type OpportunityClassification = z.output<typeof OpportunityClassificationSchema>;
export type OpportunityRecommendedAction = z.output<typeof OpportunityRecommendedActionSchema>;
export type OpportunitySuggestedPageType = z.output<typeof OpportunitySuggestedPageTypeSchema>;
export type EvidenceSourceType = z.output<typeof EvidenceSourceTypeSchema>;
export type EvidenceStrength = z.output<typeof EvidenceStrengthSchema>;
export type EvidenceProofTier = z.output<typeof EvidenceProofTierSchema>;
export type RankingProofDevice = z.output<typeof RankingProofDeviceSchema>;
export type OpportunityGroupSource = z.output<typeof OpportunityGroupSourceSchema>;
export type ApprovalStatus = z.output<typeof ApprovalStatusSchema>;
export type CustomerMembershipRole = z.output<typeof CustomerMembershipRoleSchema>;
