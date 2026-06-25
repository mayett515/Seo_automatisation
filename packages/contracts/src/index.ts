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
  "rolled_back"
] as const;

export const releaseVerificationStatuses = [
  "not_started",
  "running",
  "live_healthy",
  "live_with_warnings",
  "rollback_recommended",
  "failed"
] as const;

export const gscConnectionStatuses = ["connection_required", "connected", "error", "revoked"] as const;

export const gscSyncStatuses = ["queued", "running", "completed", "failed", "cancelled"] as const;

export const gscOpportunitySignalTypes = [
  "impressions_no_clicks",
  "positions_11_100",
  "wrong_page_service_location",
  "service_location_query"
] as const;

export const gscOpportunitySignalStatuses = ["internal_radar", "near_term_target", "rejected", "promoted"] as const;

export const approvalStatuses = ["pending", "approved", "rejected", "held"] as const;
export const releaseCheckSeverities = ["info", "warning", "blocker"] as const;
export const releaseCheckResults = ["passed", "failed", "skipped"] as const;
export const releaseItemActions = ["create", "update", "redirect", "noindex", "remove"] as const;
export const releaseNoteAudiences = ["internal", "customer"] as const;

export const ProjectIdSchema = z.string().min(1);
export const LeadIdSchema = z.string().min(1);
export const JobStatusSchema = z.enum(jobStatuses);
export const JobTypeSchema = z.enum(jobTypes);
export const TrackingEventNameSchema = z.enum(trackingEventNames);
export const DomainEventNameSchema = z.enum(domainEventNames);
export const ReleasePlanStatusSchema = z.enum(releasePlanStatuses);
export const DeploymentStatusSchema = z.enum(deploymentStatuses);
export const ReleaseVerificationStatusSchema = z.enum(releaseVerificationStatuses);
export const GscConnectionStatusSchema = z.enum(gscConnectionStatuses);
export const GscSyncStatusSchema = z.enum(gscSyncStatuses);
export const GscOpportunitySignalTypeSchema = z.enum(gscOpportunitySignalTypes);
export const GscOpportunitySignalStatusSchema = z.enum(gscOpportunitySignalStatuses);
export const ApprovalStatusSchema = z.enum(approvalStatuses);

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
  pageId: z.string().min(1).optional(),
  route: z.string().min(1),
  componentId: z.string().min(1).optional(),
  occurredAt: z.string().datetime().optional()
});

export const TrackingIngestResultSchema = z.object({
  accepted: z.boolean(),
  eventName: TrackingEventNameSchema,
  occurredAt: z.string().datetime()
});

export const CreateReleasePlanRequestSchema = z.object({
  pageVersionIds: z.array(z.string().min(1)).default([])
});

export const VerifyReleaseRequestSchema = z.object({
  deploymentId: z.string().min(1).optional()
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

export type CreateLeadInput = z.output<typeof CreateLeadSchema>;
export type Lead = z.output<typeof LeadSchema>;
export type PotentialReport = z.output<typeof PotentialReportSchema>;
export type ProjectSummary = z.output<typeof ProjectSummarySchema>;
export type MainPreview = z.output<typeof MainPreviewSchema>;
export type QueueJob = z.output<typeof QueueJobSchema>;
export type PageProposal = z.output<typeof PageProposalSchema>;
export type ReleaseCheck = z.output<typeof ReleaseCheckSchema>;
export type ReleasePlan = z.output<typeof ReleasePlanSchema>;
export type ReleaseVerification = z.output<typeof ReleaseVerificationSchema>;
export type ReleaseNote = z.output<typeof ReleaseNoteSchema>;
export type RollbackPoint = z.output<typeof RollbackPointSchema>;
export type GscConnection = z.output<typeof GscConnectionSchema>;
export type GscOAuthIntent = z.output<typeof GscOAuthIntentSchema>;
export type GscOAuthCallbackQuery = z.output<typeof GscOAuthCallbackQuerySchema>;
export type GscProperty = z.output<typeof GscPropertySchema>;
export type GscPropertyList = z.output<typeof GscPropertyListSchema>;
export type GscSyncRequest = z.output<typeof GscSyncRequestSchema>;
export type GscSyncRun = z.output<typeof GscSyncRunSchema>;
export type GscSearchAnalyticsRow = z.output<typeof GscSearchAnalyticsRowSchema>;
export type GscOpportunitySignal = z.output<typeof GscOpportunitySignalSchema>;
export type GscPerformanceSummary = z.output<typeof GscPerformanceSummarySchema>;
export type GscUrlInspectionResult = z.output<typeof GscUrlInspectionResultSchema>;
export type GscSitemapSubmission = z.output<typeof GscSitemapSubmissionSchema>;
export type TrackingEvent = z.output<typeof TrackingEventSchema>;
export type TrackingIngestResult = z.output<typeof TrackingIngestResultSchema>;
export type CreateReleasePlanRequest = z.output<typeof CreateReleasePlanRequestSchema>;
export type VerifyReleaseRequest = z.output<typeof VerifyReleaseRequestSchema>;
export type HealthResponse = z.output<typeof HealthResponseSchema>;
export type HealthProbeResponse = z.output<typeof HealthProbeResponseSchema>;
export type GscSyncQueueResponse = z.output<typeof GscSyncQueueResponseSchema>;
export type JobStatus = z.output<typeof JobStatusSchema>;
export type JobType = z.output<typeof JobTypeSchema>;
export type DomainEventName = z.output<typeof DomainEventNameSchema>;
export type ReleasePlanStatus = z.output<typeof ReleasePlanStatusSchema>;
export type DeploymentStatus = z.output<typeof DeploymentStatusSchema>;
export type ReleaseVerificationStatus = z.output<typeof ReleaseVerificationStatusSchema>;
export type GscConnectionStatus = z.output<typeof GscConnectionStatusSchema>;
export type GscSyncStatus = z.output<typeof GscSyncStatusSchema>;
export type GscOpportunitySignalType = z.output<typeof GscOpportunitySignalTypeSchema>;
export type GscOpportunitySignalStatus = z.output<typeof GscOpportunitySignalStatusSchema>;
export type ApprovalStatus = z.output<typeof ApprovalStatusSchema>;
