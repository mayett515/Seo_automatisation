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
export const aiReasoningRecoveryFailureCodes = ["work_recovery_exhausted", "work_transport_inconsistent"] as const;

export const evidenceSourceTypes = [
  "website_import",
  "gsc_signal",
  "gsc_row",
  "serp_snapshot",
  "technical_audit",
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

export const approvalStatuses = ["pending", "approved", "rejected", "held"] as const;

export const releaseItemActions = ["create", "update", "redirect", "noindex", "remove"] as const;

export const customerMembershipRoles = ["owner", "admin", "editor", "viewer"] as const;

export const ProjectIdSchema = z.string().min(1);
export const LeadIdSchema = z.string().min(1);

export const JobStatusSchema = z.enum(jobStatuses);
export const DomainEventNameSchema = z.enum(domainEventNames);

export const ReasoningTaskSchema = z.enum(reasoningTasks);
export const AgentRunStatusSchema = z.enum(agentRunStatuses);
export const AiReasoningAdapterFailureCodeSchema = z.enum(aiReasoningAdapterFailureCodes);
export const AiReasoningWorkflowFailureCodeSchema = z.enum(aiReasoningWorkflowFailureCodes);
export const AiReasoningEnqueueFailureCodeSchema = z.enum(aiReasoningEnqueueFailureCodes);

export const EvidenceSourceTypeSchema = z.enum(evidenceSourceTypes);
export const EvidenceStrengthSchema = z.enum(evidenceStrengths);
export const EvidenceProofTierSchema = z.enum(evidenceProofTiers);

export const ApprovalStatusSchema = z.enum(approvalStatuses);
export const ReleaseItemActionSchema = z.enum(releaseItemActions);

export const CustomerMembershipRoleSchema = z.enum(customerMembershipRoles);

export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const DateRangeSchema = z.object({
  from: IsoDateSchema,
  to: IsoDateSchema
});

export const HttpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Expected an http(s) URL.");

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

export type DomainEventName = z.output<typeof DomainEventNameSchema>;
export type ReasoningTask = z.output<typeof ReasoningTaskSchema>;
export type AgentRunStatus = z.output<typeof AgentRunStatusSchema>;
export type AiReasoningAdapterFailureCode = z.output<typeof AiReasoningAdapterFailureCodeSchema>;
export type AiReasoningWorkflowFailureCode = z.output<typeof AiReasoningWorkflowFailureCodeSchema>;
export type AiReasoningEnqueueFailureCode = z.output<typeof AiReasoningEnqueueFailureCodeSchema>;
export type AiReasoningRecoveryFailureCode = (typeof aiReasoningRecoveryFailureCodes)[number];
export type EvidenceSourceType = z.output<typeof EvidenceSourceTypeSchema>;
export type EvidenceStrength = z.output<typeof EvidenceStrengthSchema>;
export type EvidenceProofTier = z.output<typeof EvidenceProofTierSchema>;
export type EvidenceRef = z.output<typeof EvidenceRefSchema>;
export type CustomerMembershipRole = z.output<typeof CustomerMembershipRoleSchema>;
export type HealthResponse = z.output<typeof HealthResponseSchema>;
export type HealthProbeResponse = z.output<typeof HealthProbeResponseSchema>;
export type JobStatus = z.output<typeof JobStatusSchema>;
export type ApprovalStatus = z.output<typeof ApprovalStatusSchema>;
export type ReleaseItemAction = z.output<typeof ReleaseItemActionSchema>;
