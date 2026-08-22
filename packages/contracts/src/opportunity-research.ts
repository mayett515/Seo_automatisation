import { z } from "zod";

const UuidSchema = z.string().uuid();
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u, "Expected a lowercase hexadecimal SHA-256 digest.");
const IsoDateTimeSchema = z.string().datetime();
const BoundedTextSchema = z.string().trim().min(1).max(2_000);
const HttpUrlSchema = z
  .string()
  .url()
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "Expected an http(s) URL.");

export const agentWorkflowNames = ["opportunity_research"] as const;
export const opportunityResearchWorkflowVersion = "opportunity-research.v2" as const;
export const opportunityResearchConstraintProfileVersion = "opportunity-research-policy.v1" as const;
export const opportunityResearchStepKeys = {
  researchPlan: "research-plan-agent.v2",
  followUpCapture: "follow-up-capture.v2",
  strategy: "seo-strategy-agent.v2"
} as const;
export const opportunityResearchStepIdentities = {
  researchPlan: {
    stepKey: opportunityResearchStepKeys.researchPlan,
    stepKind: "agent",
    agentRole: "ResearchAgent",
    toolKey: null
  },
  followUpCapture: {
    stepKey: opportunityResearchStepKeys.followUpCapture,
    stepKind: "tool",
    agentRole: null,
    toolKey: "public_web_search_follow_up"
  },
  strategy: {
    stepKey: opportunityResearchStepKeys.strategy,
    stepKind: "agent",
    agentRole: "SeoStrategyAgent",
    toolKey: null
  }
} as const;
export const agentRunStepKinds = ["workflow", "agent", "tool", "qa", "persist"] as const;
export const agentRunStepStatuses = ["pending", "running", "succeeded", "failed", "skipped"] as const;
export const agentRunEventTypes = [
  "run.queued",
  "run.started",
  "run.succeeded",
  "run.failed",
  "step.started",
  "step.succeeded",
  "step.failed",
  "step.skipped",
  "tool.call.requested",
  "tool.call.allowed",
  "tool.call.blocked",
  "tool.result.captured",
  "tool.call.failed",
  "evidence.bound",
  "qa.gate.passed",
  "qa.gate.failed",
  "proposal.persisted",
  "recovery.claimed",
  "recovery.exhausted"
] as const;
export const agentRunEvidenceSourceKinds = [
  "business_profile_revision",
  "canonical_service",
  "canonical_area",
  "website_import",
  "gsc_row",
  "gsc_signal",
  "ranking_proof",
  "public_web_search_capture",
  "knowledge_version",
  "technical_audit_finding",
  "existing_page"
] as const;
export const agentRunEvidenceRoles = ["input", "captured", "cited", "rejected"] as const;
export const opportunityResearchFailureCodes = [
  "configuration_error",
  "material_or_evidence_invalid",
  "material_stale",
  "lifecycle_conflict",
  "provider_unavailable",
  "provider_response_invalid",
  "provider_not_configured",
  "provider_timeout",
  "model_egress_blocked",
  "qa_rejected",
  "workflow_in_progress",
  "enqueue_failed",
  "queue_enqueue_failed",
  "work_recovery_exhausted",
  "work_transport_inconsistent",
  "workflow_failed",
  "workflow_execution_failed"
] as const;

export const AgentWorkflowNameSchema = z.enum(agentWorkflowNames);
export const AgentRunStepKindSchema = z.enum(agentRunStepKinds);
export const AgentRunStepStatusSchema = z.enum(agentRunStepStatuses);
export const AgentRunEventTypeSchema = z.enum(agentRunEventTypes);
export const AgentRunEvidenceSourceKindSchema = z.enum(agentRunEvidenceSourceKinds);
export const AgentRunEvidenceRoleSchema = z.enum(agentRunEvidenceRoles);
export const OpportunityResearchFailureCodeSchema = z.enum(opportunityResearchFailureCodes);
export type OpportunityResearchFailureCode = z.output<typeof OpportunityResearchFailureCodeSchema>;

export const AgentRunWorkflowIdentitySchema = z
  .object({
    workflowName: AgentWorkflowNameSchema,
    workflowVersion: z.string().trim().min(1).max(80),
    constraintProfileVersion: z.string().trim().min(1).max(80),
    inputSha256: Sha256Schema,
    outputSha256: Sha256Schema.optional()
  })
  .strict();

export const AgentRunStepSummarySchema = z
  .object({
    id: UuidSchema,
    runId: UuidSchema,
    stepKey: z.string().trim().min(1).max(120),
    stepKind: AgentRunStepKindSchema,
    status: AgentRunStepStatusSchema,
    attemptCount: z.number().int().nonnegative().max(20),
    executionEpoch: z.number().int().nonnegative(),
    rowVersion: z.number().int().nonnegative(),
    agentRole: z.string().trim().min(1).max(80).optional(),
    toolKey: z.string().trim().min(1).max(120).optional(),
    provider: z.string().trim().min(1).max(120).optional(),
    model: z.string().trim().min(1).max(160).optional(),
    failureCode: z.string().trim().min(1).max(120).optional(),
    startedAt: IsoDateTimeSchema.optional(),
    completedAt: IsoDateTimeSchema.optional(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema
  })
  .strict();

export const AgentRunEventSummarySchema = z
  .object({
    id: UuidSchema,
    runId: UuidSchema,
    stepId: UuidSchema.optional(),
    sequence: z.number().int().positive(),
    eventKey: z.string().trim().min(1).max(180),
    eventType: AgentRunEventTypeSchema,
    executionEpoch: z.number().int().nonnegative(),
    occurredAt: IsoDateTimeSchema
  })
  .strict();

export const AgentRunEvidenceSummarySchema = z
  .object({
    id: UuidSchema,
    runId: UuidSchema,
    evidenceKey: z.string().trim().min(1).max(180),
    sourceKind: AgentRunEvidenceSourceKindSchema,
    sourceId: UuidSchema,
    sourceVersion: z.string().trim().min(1).max(160),
    executionEpoch: z.number().int().positive(),
    payloadSha256: Sha256Schema,
    observedAt: IsoDateTimeSchema,
    proofTier: z.enum(["internal_signal", "supporting_context", "customer_safe_proof"]),
    summary: z.string().trim().min(1).max(1_000)
  })
  .strict();

export const AgentRunTimelineResponseSchema = z
  .object({
    projectId: UuidSchema,
    runId: UuidSchema,
    steps: z.array(AgentRunStepSummarySchema).max(100),
    events: z.array(AgentRunEventSummarySchema).max(500),
    evidence: z.array(AgentRunEvidenceSummarySchema).max(500)
  })
  .strict();

export const businessProfileStatuses = ["draft", "confirmed"] as const;
export const canonicalEntityStatuses = ["proposed", "confirmed", "rejected", "retired"] as const;
export const canonicalEntitySourceKinds = ["manual", "website_import", "knowledge"] as const;
export const knowledgeVersionStatuses = ["proposed", "approved", "rejected"] as const;
export const knowledgeSourceKinds = ["human", "agent", "website_import", "field_evidence", "research"] as const;
export const knowledgeModelUsePolicies = ["operator_only", "model_allowed"] as const;
export const knowledgeLinkKinds = ["supports", "supersedes", "related", "derived_from"] as const;
export const knowledgeTaskScopes = [
  "opportunity_research",
  "page_proposal",
  "section_copy",
  "customer_report"
] as const;

export const BusinessProfileStatusSchema = z.enum(businessProfileStatuses);
export const CanonicalEntityStatusSchema = z.enum(canonicalEntityStatuses);
export const CanonicalEntitySourceKindSchema = z.enum(canonicalEntitySourceKinds);
export const KnowledgeVersionStatusSchema = z.enum(knowledgeVersionStatuses);
export const KnowledgeSourceKindSchema = z.enum(knowledgeSourceKinds);
export const KnowledgeModelUsePolicySchema = z.enum(knowledgeModelUsePolicies);
export const KnowledgeLinkKindSchema = z.enum(knowledgeLinkKinds);
export const KnowledgeTaskScopeSchema = z.enum(knowledgeTaskScopes);

export const ProjectBusinessProfileContentSchema = z
  .object({
    businessName: z.string().trim().min(1).max(200),
    websiteUrl: HttpUrlSchema,
    description: z.string().trim().min(1).max(4_000).optional(),
    differentiators: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
    targetCustomers: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
    operatingNotes: z.array(z.string().trim().min(1).max(500)).max(20).default([])
  })
  .strict();

export const UpdateProjectBusinessProfileRequestSchema = z
  .object({
    expectedRowVersion: z.number().int().nonnegative(),
    profile: ProjectBusinessProfileContentSchema,
    sourceImportRunId: UuidSchema.optional(),
    services: z.array(z.string().trim().min(1).max(160)).max(100).default([]),
    areas: z.array(z.string().trim().min(1).max(160)).max(100).default([])
  })
  .strict();

export const ConfirmProjectBusinessProfileRequestSchema = z
  .object({
    expectedRowVersion: z.number().int().nonnegative(),
    expectedRevisionId: UuidSchema,
    serviceIds: z.array(UuidSchema).min(1).max(100),
    areaIds: z.array(UuidSchema).min(1).max(100)
  })
  .strict();

export const ConfirmWebsiteImportKnowledgeRequestSchema = z
  .object({
    importRunId: UuidSchema,
    expectedProfileRowVersion: z.number().int().nonnegative(),
    profile: ProjectBusinessProfileContentSchema,
    services: z.array(z.string().trim().min(1).max(160)).min(1).max(100),
    areas: z.array(z.string().trim().min(1).max(160)).min(1).max(100)
  })
  .strict();

export const ProjectBusinessProfileRevisionSchema = z
  .object({
    id: UuidSchema,
    projectId: UuidSchema,
    revision: z.number().int().positive(),
    profile: ProjectBusinessProfileContentSchema,
    sourceImportRunId: UuidSchema.optional(),
    createdByUserId: UuidSchema.optional(),
    createdAt: IsoDateTimeSchema
  })
  .strict();

export const CanonicalBusinessEntitySchema = z
  .object({
    id: UuidSchema,
    name: z.string().trim().min(1).max(160),
    status: CanonicalEntityStatusSchema,
    sourceKind: CanonicalEntitySourceKindSchema,
    sourceId: UuidSchema.optional(),
    rowVersion: z.number().int().nonnegative(),
    confirmedAt: IsoDateTimeSchema.optional(),
    confirmedByUserId: UuidSchema.optional(),
    retiredAt: IsoDateTimeSchema.optional(),
    retiredByUserId: UuidSchema.optional()
  })
  .strict();

export const ProjectBusinessProfileResponseSchema = z
  .object({
    projectId: UuidSchema,
    status: BusinessProfileStatusSchema,
    rowVersion: z.number().int().nonnegative(),
    currentRevision: ProjectBusinessProfileRevisionSchema.optional(),
    services: z.array(CanonicalBusinessEntitySchema).max(100),
    areas: z.array(CanonicalBusinessEntitySchema).max(100),
    confirmedAt: IsoDateTimeSchema.optional(),
    confirmedByUserId: UuidSchema.optional()
  })
  .strict();

const MarkdownBodySchema = z
  .string()
  .trim()
  .min(1)
  .max(50_000)
  .refine((value) => new TextEncoder().encode(value).byteLength <= 50_000, "Markdown exceeds 50 KiB UTF-8.")
  .refine((value) => !hasForbiddenMarkdownControl(value), "Markdown contains control characters.");

function hasForbiddenMarkdownControl(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 9 || code === 11 || code === 12 || (code > 13 && code < 32) || code === 127) return true;
  }
  return false;
}

export const ProjectKnowledgeLinkInputSchema = z
  .object({
    toVersionId: UuidSchema,
    kind: KnowledgeLinkKindSchema
  })
  .strict();

export const CreateProjectKnowledgeVersionRequestSchema = z
  .object({
    documentKey: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u),
    title: z.string().trim().min(1).max(240),
    bodyMarkdown: MarkdownBodySchema,
    taskScopes: z.array(KnowledgeTaskScopeSchema).min(1).max(10),
    sourceKind: KnowledgeSourceKindSchema,
    sourceId: UuidSchema.optional(),
    modelUsePolicy: KnowledgeModelUsePolicySchema.default("operator_only"),
    links: z.array(ProjectKnowledgeLinkInputSchema).max(50).optional(),
    approveImmediately: z.boolean().default(false)
  })
  .strict()
  .superRefine((value, context) => {
    const identities = (value.links ?? []).map((link) => `${link.toVersionId}:${link.kind}`);
    if (new Set(identities).size !== identities.length) {
      context.addIssue({ code: "custom", path: ["links"], message: "Knowledge links must be unique." });
    }
  });

export const ReviewProjectKnowledgeVersionRequestSchema = z
  .object({
    expectedStatus: z.literal("proposed"),
    expectedModelUsePolicy: KnowledgeModelUsePolicySchema,
    decision: z.enum(["approve", "reject"]),
    reason: z.string().trim().min(1).max(2_000).optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.decision === "reject" && !value.reason) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Rejecting knowledge requires a reason." });
    }
  });

export const ProjectKnowledgeVersionSchema = z
  .object({
    id: UuidSchema,
    documentId: UuidSchema,
    projectId: UuidSchema,
    documentKey: z.string().min(1),
    version: z.number().int().positive(),
    title: z.string().min(1),
    bodyMarkdown: MarkdownBodySchema,
    status: KnowledgeVersionStatusSchema,
    sourceKind: KnowledgeSourceKindSchema,
    sourceId: UuidSchema.optional(),
    modelUsePolicy: KnowledgeModelUsePolicySchema,
    isCurrent: z.boolean(),
    documentRetiredAt: IsoDateTimeSchema.optional(),
    contentSha256: Sha256Schema,
    taskScopes: z.array(KnowledgeTaskScopeSchema).max(10),
    links: z.array(ProjectKnowledgeLinkInputSchema).max(50),
    createdByUserId: UuidSchema.optional(),
    reviewedByUserId: UuidSchema.optional(),
    reviewedAt: IsoDateTimeSchema.optional(),
    rejectionReason: z.string().min(1).optional(),
    createdAt: IsoDateTimeSchema
  })
  .strict();

export const RetireProjectKnowledgeDocumentRequestSchema = z
  .object({
    expectedCurrentApprovedVersionId: UuidSchema,
    reason: z.string().trim().min(1).max(2_000)
  })
  .strict();

export const RetireProjectKnowledgeDocumentResponseSchema = z
  .object({
    documentId: UuidSchema,
    projectId: UuidSchema,
    retiredVersionId: UuidSchema,
    retiredByUserId: UuidSchema,
    retiredAt: IsoDateTimeSchema,
    reason: z.string().min(1).max(2_000)
  })
  .strict();

export const ProjectKnowledgeSearchResponseSchema = z
  .object({
    projectId: UuidSchema,
    records: z.array(ProjectKnowledgeVersionSchema).max(50)
  })
  .strict();

export const ProjectKnowledgeSearchRequestSchema = z
  .object({
    query: z.string().trim().max(240).default(""),
    taskScope: KnowledgeTaskScopeSchema.optional(),
    status: KnowledgeVersionStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20)
  })
  .strict();

export const publicWebSearchFailureCodes = [
  "provider_timeout",
  "provider_unavailable",
  "provider_blocked",
  "invalid_response",
  "policy_denied"
] as const;
export const PublicWebSearchFailureCodeSchema = z.enum(publicWebSearchFailureCodes);

export const PublicWebSearchRequestSchema = z
  .object({
    projectId: UuidSchema,
    runId: UuidSchema,
    executionEpoch: z.number().int().positive(),
    query: z.string().trim().min(1).max(240),
    requestedLocale: z.string().trim().min(1).max(80),
    requestedRegion: z.string().trim().min(1).max(120).optional(),
    researchOrdinal: z.number().int().positive().max(12),
    round: z.number().int().min(1).max(2),
    maxResults: z.number().int().min(1).max(5).default(5)
  })
  .strict();

export const PublicWebSearchItemSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    url: HttpUrlSchema,
    displayUrl: z.string().trim().min(1).max(300).optional(),
    domain: z.string().trim().min(1).max(255),
    snippet: z.string().trim().min(1).max(1_000).optional()
  })
  .strict();

export function buildPublicWebSearchCaptureEvidenceKey(captureId: string): string {
  return `public_web_search_capture:${UuidSchema.parse(captureId)}`;
}

export const PublicWebSearchCaptureSchema = z
  .object({
    id: UuidSchema,
    projectId: UuidSchema,
    runId: UuidSchema,
    executionEpoch: z.number().int().positive(),
    query: z.string().min(1),
    provider: z.literal("duckduckgo_html"),
    requestedLocale: z.string().min(1),
    requestedRegion: z.string().min(1).optional(),
    maxResults: z.number().int().min(1).max(5),
    effectiveLocale: z.string().min(1),
    observedLocale: z.string().min(1).optional(),
    researchOrdinal: z.number().int().positive().max(12),
    round: z.number().int().min(1).max(2),
    status: z.enum(["succeeded", "failed"]),
    failureCode: PublicWebSearchFailureCodeSchema.optional(),
    results: z.array(PublicWebSearchItemSchema).max(5),
    evidencePolicy: z.literal("research_support_only"),
    evidenceKey: z.string().trim().min(1).max(128).optional(),
    capturedAt: IsoDateTimeSchema
  })
  .strict()
  .superRefine((capture, context) => {
    const expected = buildPublicWebSearchCaptureEvidenceKey(capture.id);
    if (capture.evidenceKey !== undefined && capture.evidenceKey !== expected) {
      context.addIssue({ code: "custom", path: ["evidenceKey"], message: "Capture evidenceKey must match its id." });
    }
  })
  .transform((capture) => ({ ...capture, evidenceKey: buildPublicWebSearchCaptureEvidenceKey(capture.id) }));

export const opportunityRankingMilestones = [
  "unverified",
  "outside_top_10",
  "top_10",
  "top_5",
  "top_3",
  "rank_1"
] as const;
export const opportunityEvidenceReadiness = ["internal_signal", "supporting_context", "reviewed_proof"] as const;
export const opportunityValueBands = ["unknown", "low", "medium", "high"] as const;
export const opportunityLanes = ["defend_advance", "quick_win", "build_cluster", "strategic_market"] as const;
export const opportunityResearchStatuses = [
  "idle",
  "needs_research",
  "queued",
  "running",
  "succeeded",
  "failed",
  "paused"
] as const;

export const OpportunityRankingMilestoneSchema = z.enum(opportunityRankingMilestones);
export const OpportunityEvidenceReadinessSchema = z.enum(opportunityEvidenceReadiness);
export const OpportunityValueBandSchema = z.enum(opportunityValueBands);
export const OpportunityLaneSchema = z.enum(opportunityLanes);
export const OpportunityResearchStatusSchema = z.enum(opportunityResearchStatuses);

export const OpportunityResearchAxesSchema = z
  .object({
    rankingMilestone: OpportunityRankingMilestoneSchema,
    evidenceReadiness: OpportunityEvidenceReadinessSchema,
    businessValue: OpportunityValueBandSchema,
    marketDifficulty: OpportunityValueBandSchema,
    executionEffort: OpportunityValueBandSchema,
    lane: OpportunityLaneSchema
  })
  .strict();

export const OpportunityResearchCandidateSchema = z
  .object({
    serviceId: UuidSchema,
    areaId: UuidSchema,
    service: z.string().trim().min(1).max(160),
    area: z.string().trim().min(1).max(160),
    primaryKeyword: z.string().trim().min(1).max(240),
    secondaryKeywords: z.array(z.string().trim().min(1).max(240)).max(15).default([]),
    suggestedRoute: z.string().trim().min(1).max(500).optional(),
    suggestedPageType: z.enum(["normal_page", "subdomain", "backlog", "monitor_only"]),
    businessValue: OpportunityValueBandSchema,
    marketDifficulty: OpportunityValueBandSchema,
    executionEffort: OpportunityValueBandSchema,
    evidenceKeys: z.array(z.string().trim().min(1).max(180)).min(1).max(25),
    rationale: z.string().trim().min(1).max(1_500),
    missingEvidence: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
    confidence: z.number().min(0).max(1)
  })
  .strict();

export const OpportunityResearchStoredEvidenceSchema = z
  .object({
    workflowVersion: z.literal(opportunityResearchWorkflowVersion),
    candidate: OpportunityResearchCandidateSchema,
    derivedAxes: OpportunityResearchAxesSchema,
    citedEvidenceKeys: z.array(z.string().trim().min(1).max(180)).min(1).max(25)
  })
  .strict()
  .superRefine((value, ctx) => {
    const citedKeys = [...new Set(value.citedEvidenceKeys)].sort();
    const candidateKeys = [...new Set(value.candidate.evidenceKeys)].sort();
    if (
      citedKeys.length !== value.citedEvidenceKeys.length ||
      citedKeys.some((key, index) => key !== value.citedEvidenceKeys[index])
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["citedEvidenceKeys"],
        message: "Stored opportunity citations must be unique and code-unit sorted."
      });
    }
    if (
      candidateKeys.length !== value.candidate.evidenceKeys.length ||
      candidateKeys.length !== citedKeys.length ||
      candidateKeys.some((key, index) => key !== citedKeys[index])
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["candidate", "evidenceKeys"],
        message: "Candidate evidence keys must match the stored citation set exactly."
      });
    }
    if (
      value.candidate.businessValue !== value.derivedAxes.businessValue ||
      value.candidate.marketDifficulty !== value.derivedAxes.marketDifficulty ||
      value.candidate.executionEffort !== value.derivedAxes.executionEffort
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["derivedAxes"],
        message: "Stored opportunity axes must match the candidate values."
      });
    }
  });

export const OpportunityResearchCitationSummarySchema = z
  .object({
    evidenceKey: z.string().trim().min(1).max(180),
    sourceKind: AgentRunEvidenceSourceKindSchema,
    proofTier: AgentRunEvidenceSummarySchema.shape.proofTier,
    summary: z.string().trim().min(1).max(1_000)
  })
  .strict();

export const OpportunityResearchAgentOutputSchema = z
  .object({
    followUpQueries: z.array(z.string().trim().min(1).max(240)).max(3),
    findings: z
      .array(
        z
          .object({
            findingKey: z.string().trim().min(1).max(120),
            summary: z.string().trim().min(1).max(1_000),
            evidenceKeys: z.array(z.string().trim().min(1).max(180)).min(1).max(20)
          })
          .strict()
      )
      .max(20)
  })
  .strict();

export const OpportunityStrategyAgentOutputSchema = z
  .object({
    candidates: z.array(OpportunityResearchCandidateSchema).max(20),
    runNotes: z.string().trim().min(1).max(2_000).optional()
  })
  .strict();

export const OpportunityResearchWorkflowInputSchema = z
  .object({
    projectId: UuidSchema,
    runId: UuidSchema,
    materialDigest: Sha256Schema,
    maxCandidates: z.number().int().min(1).max(20).default(20),
    initialQueries: z.array(z.string().trim().min(1).max(240)).min(1).max(9),
    requestedLocale: z.string().trim().min(1).max(80).default("de-DE"),
    requestedRegion: z.string().trim().min(1).max(120).optional(),
    evidencePacket: z.record(z.string(), z.unknown())
  })
  .strict();

export const OpportunityResearchPlanStepOutputSchema = z
  .object({
    projectId: UuidSchema,
    runId: UuidSchema,
    materialDigest: Sha256Schema,
    maxCandidates: z.number().int().min(1).max(20),
    requestedLocale: z.string().trim().min(1).max(80),
    requestedRegion: z.string().trim().min(1).max(120).optional(),
    evidencePacket: z.record(z.string(), z.unknown()),
    initialCaptures: z.array(PublicWebSearchCaptureSchema).max(9),
    plannedFollowUpQueries: z.array(z.string().trim().min(1).max(240)).max(3),
    research: OpportunityResearchAgentOutputSchema
  })
  .strict();

export const OpportunityResearchResearchStepOutputSchema = z
  .object({
    projectId: UuidSchema,
    runId: UuidSchema,
    materialDigest: Sha256Schema,
    maxCandidates: z.number().int().min(1).max(20),
    evidencePacket: z.record(z.string(), z.unknown()),
    captures: z.array(PublicWebSearchCaptureSchema).max(12),
    research: OpportunityResearchAgentOutputSchema
  })
  .strict();

export const OpportunityResearchEnqueueDataSchema = z
  .object({
    projectId: UuidSchema,
    runId: UuidSchema,
    materialDigest: Sha256Schema,
    triggerSource: z.enum(["user_action", "material_dirty", "weekly_scan"]),
    requestedByUserId: UuidSchema.optional(),
    maxAttempts: z.number().int().min(1).max(5).default(3)
  })
  .strict();

export const OpportunityResearchJobDataSchema = z.union([
  OpportunityResearchEnqueueDataSchema.extend({ jobRunId: UuidSchema }).strict(),
  z
    .object({
      projectId: UuidSchema,
      runId: UuidSchema,
      materialDigest: Sha256Schema,
      triggerSource: z.literal("work_recovery"),
      requestedByUserId: UuidSchema.optional(),
      maxAttempts: z.number().int().min(1).max(5).default(3),
      jobRunId: UuidSchema,
      expectedRecoveryCount: z.number().int().positive().max(20)
    })
    .strict()
]);

export const OpportunityResearchWorkflowOutputSchema = z
  .object({
    candidates: z.array(OpportunityResearchCandidateSchema).max(20),
    captures: z.array(PublicWebSearchCaptureSchema).max(12),
    research: OpportunityResearchAgentOutputSchema,
    runNotes: z.string().trim().min(1).max(2_000).optional()
  })
  .strict();

export const OpportunityResearchStateSchema = z
  .object({
    projectId: UuidSchema,
    status: OpportunityResearchStatusSchema,
    rowVersion: z.number().int().nonnegative(),
    materialDigest: Sha256Schema.optional(),
    currentMaterialDigest: Sha256Schema,
    materialDirty: z.boolean(),
    lastSuccessfulDigest: Sha256Schema.optional(),
    activeRunId: UuidSchema.optional(),
    nextScheduledAt: IsoDateTimeSchema.optional(),
    lastRunAt: IsoDateTimeSchema.optional(),
    pausedAt: IsoDateTimeSchema.optional(),
    pausedByUserId: UuidSchema.optional(),
    pauseReason: BoundedTextSchema.optional(),
    readinessIssues: z.array(z.string().trim().min(1).max(240)).max(20),
    portfolioShortfalls: z
      .object({
        defendAdvance: z.number().int().nonnegative(),
        quickBuild: z.number().int().nonnegative(),
        strategic: z.number().int().nonnegative()
      })
      .strict()
  })
  .strict();

export const UpdateOpportunityResearchPauseRequestSchema = z
  .object({
    expectedRowVersion: z.number().int().nonnegative(),
    paused: z.boolean(),
    reason: BoundedTextSchema.optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.paused && !value.reason) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Pausing research requires a reason." });
    }
  });

export const RerunOpportunityResearchRequestSchema = z
  .object({
    expectedRowVersion: z.number().int().nonnegative(),
    idempotencyKey: z.string().trim().min(1).max(180)
  })
  .strict();

export type AgentWorkflowName = z.output<typeof AgentWorkflowNameSchema>;
export type AgentRunStepKind = z.output<typeof AgentRunStepKindSchema>;
export type AgentRunStepStatus = z.output<typeof AgentRunStepStatusSchema>;
export type AgentRunEventType = z.output<typeof AgentRunEventTypeSchema>;
export type AgentRunEvidenceSourceKind = z.output<typeof AgentRunEvidenceSourceKindSchema>;
export type AgentRunEvidenceRole = z.output<typeof AgentRunEvidenceRoleSchema>;
export type AgentRunTimelineResponse = z.output<typeof AgentRunTimelineResponseSchema>;
export type ProjectBusinessProfileContent = z.output<typeof ProjectBusinessProfileContentSchema>;
export type UpdateProjectBusinessProfileRequest = z.output<typeof UpdateProjectBusinessProfileRequestSchema>;
export type ConfirmProjectBusinessProfileRequest = z.output<typeof ConfirmProjectBusinessProfileRequestSchema>;
export type ConfirmWebsiteImportKnowledgeRequest = z.output<typeof ConfirmWebsiteImportKnowledgeRequestSchema>;
export type ProjectBusinessProfileResponse = z.output<typeof ProjectBusinessProfileResponseSchema>;
export type CreateProjectKnowledgeVersionRequest = z.output<typeof CreateProjectKnowledgeVersionRequestSchema>;
export type ReviewProjectKnowledgeVersionRequest = z.output<typeof ReviewProjectKnowledgeVersionRequestSchema>;
export type ProjectKnowledgeVersion = z.output<typeof ProjectKnowledgeVersionSchema>;
export type RetireProjectKnowledgeDocumentRequest = z.output<typeof RetireProjectKnowledgeDocumentRequestSchema>;
export type RetireProjectKnowledgeDocumentResponse = z.output<typeof RetireProjectKnowledgeDocumentResponseSchema>;
export type ProjectKnowledgeSearchResponse = z.output<typeof ProjectKnowledgeSearchResponseSchema>;
export type ProjectKnowledgeSearchRequest = z.output<typeof ProjectKnowledgeSearchRequestSchema>;
export type KnowledgeVersionStatus = z.output<typeof KnowledgeVersionStatusSchema>;
export type KnowledgeModelUsePolicy = z.output<typeof KnowledgeModelUsePolicySchema>;
export type PublicWebSearchRequest = z.output<typeof PublicWebSearchRequestSchema>;
export type PublicWebSearchItem = z.output<typeof PublicWebSearchItemSchema>;
export type PublicWebSearchCapture = z.output<typeof PublicWebSearchCaptureSchema>;
export type PublicWebSearchFailureCode = z.output<typeof PublicWebSearchFailureCodeSchema>;
export type OpportunityResearchAxes = z.output<typeof OpportunityResearchAxesSchema>;
export type OpportunityResearchCandidate = z.output<typeof OpportunityResearchCandidateSchema>;
export type OpportunityResearchStoredEvidence = z.output<typeof OpportunityResearchStoredEvidenceSchema>;
export type OpportunityResearchCitationSummary = z.output<typeof OpportunityResearchCitationSummarySchema>;
export type OpportunityResearchAgentOutput = z.output<typeof OpportunityResearchAgentOutputSchema>;
export type OpportunityStrategyAgentOutput = z.output<typeof OpportunityStrategyAgentOutputSchema>;
export type OpportunityResearchWorkflowInput = z.output<typeof OpportunityResearchWorkflowInputSchema>;
export type OpportunityResearchPlanStepOutput = z.output<typeof OpportunityResearchPlanStepOutputSchema>;
export type OpportunityResearchResearchStepOutput = z.output<typeof OpportunityResearchResearchStepOutputSchema>;
export type OpportunityResearchWorkflowOutput = z.output<typeof OpportunityResearchWorkflowOutputSchema>;
export type OpportunityResearchJobData = z.output<typeof OpportunityResearchJobDataSchema>;
export type OpportunityResearchState = z.output<typeof OpportunityResearchStateSchema>;
export type UpdateOpportunityResearchPauseRequest = z.output<typeof UpdateOpportunityResearchPauseRequestSchema>;
export type RerunOpportunityResearchRequest = z.output<typeof RerunOpportunityResearchRequestSchema>;
export type OpportunityRankingMilestone = z.output<typeof OpportunityRankingMilestoneSchema>;
export type OpportunityEvidenceReadiness = z.output<typeof OpportunityEvidenceReadinessSchema>;
export type OpportunityValueBand = z.output<typeof OpportunityValueBandSchema>;
export type OpportunityLane = z.output<typeof OpportunityLaneSchema>;
