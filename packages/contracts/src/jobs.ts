import { z } from "zod";

import { JobStatusSchema, LeadIdSchema, ProjectIdSchema } from "./common.js";
import { GscConnectionSchema } from "./gsc.js";
import { OpportunityScoutQueueStatusSchema } from "./opportunities.js";
import {
  PageProposalQueueStatusSchema,
  PageStudioSectionIdSchema,
  SectionCopySuggestionQueueStatusSchema
} from "./pages.js";
import { ReleaseVerificationQueueStatusSchema } from "./releases.js";
import { SerpScoutRequestSchema } from "./opportunities.js";
import { WebsiteImportSourceUrlSchema } from "./website-import.js";

export { jobStatuses, JobStatusSchema } from "./common.js";

export const jobTypes = [
  "pre_audit",
  "website_import",
  "opportunity_scout",
  "opportunity_research",
  "serp_scout",
  "technical_audit",
  "local_analysis",
  "page_generation",
  "media_processing",
  "seo_qa",
  "deployment_agent_preflight",
  "deploy",
  "release_verification",
  "gsc_sync",
  "analytics",
  "report",
  "report_artifact",
  "notification",
  "rollback"
] as const;

export const queueNames = [
  "pre-audit",
  "website-import",
  "opportunity-scout",
  "opportunity-research",
  "serp-scout",
  "technical-audit",
  "local-analysis",
  "page-generation",
  "media-processing",
  "seo-qa",
  "deploy",
  "rollback",
  "release-verification",
  "gsc-sync",
  "analytics",
  "report",
  "notifications"
] as const;

export type QueueName = (typeof queueNames)[number];

// Canonical job name for each queue. The worker routes a job when its queue
// name OR its job name matches a lane, so each queue maps to one canonical job
// name (mirroring the exact literals already used at enqueue sites today).
// Queues without a current enqueue site use the kebab->snake canonical form.
export const queueJobNames = {
  "pre-audit": "pre_audit",
  "website-import": "website_import",
  "opportunity-scout": "opportunity_scout",
  "opportunity-research": "opportunity_research",
  "serp-scout": "serp_scout",
  "technical-audit": "technical_audit",
  "local-analysis": "local_analysis",
  "page-generation": "page_generation",
  "media-processing": "media_processing",
  "seo-qa": "seo_qa",
  deploy: "deploy",
  rollback: "rollback",
  "release-verification": "release_verification",
  "gsc-sync": "gsc_sync",
  analytics: "analytics",
  report: "customer_report_generation",
  notifications: "notifications"
} as const satisfies Record<QueueName, string>;

// Job names that share a queue with a canonical job but are routed by job name
// alone in the worker (no queue-based lane). Kept as constants so callers never
// retype the literal.
export const secondaryJobNames = {
  pageGeneration: "section_text_generation",
  customerReportHtmlRender: "customer_report_html_render"
} as const;

// The full set of valid job-name literals: every canonical queue job plus the
// secondary jobs. Used to type enqueue `jobName` fields.
export type JobName = (typeof queueJobNames)[QueueName] | (typeof secondaryJobNames)[keyof typeof secondaryJobNames];

export const JobTypeSchema = z.enum(jobTypes);
export const QueueNameSchema = z.enum(queueNames);

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

/** Shared optional audit/retry fields on queue job payloads. Not `.strict()`: callers opt in. */
const JobDataEnvelopeSchema = z.object({
  maxAttempts: z.number().int().positive().optional(),
  jobRunId: z.string().min(1).optional(),
  triggeredByUserId: z.string().min(1).nullable().optional(),
  triggerSource: z.string().min(1).optional()
});

export const DeployJobDataSchema = JobDataEnvelopeSchema.extend({
  projectId: ProjectIdSchema,
  releasePlanId: z.string().min(1),
  deploymentKey: z.string().min(1)
}).strict();

export const RollbackJobDataSchema = JobDataEnvelopeSchema.extend({
  projectId: ProjectIdSchema,
  releasePlanId: z.string().min(1),
  deploymentId: z.string().min(1),
  rollbackPointId: z.string().min(1)
}).strict();

export const ReleaseVerificationJobDataSchema = JobDataEnvelopeSchema.extend({
  projectId: ProjectIdSchema,
  releasePlanId: z.string().min(1),
  deploymentId: z.string().min(1),
  verificationId: z.string().min(1)
}).strict();

export const WebsiteImportJobDataSchema = JobDataEnvelopeSchema.extend({
  projectId: ProjectIdSchema,
  importRunId: z.string().min(1),
  sourceUrl: WebsiteImportSourceUrlSchema
}).strict();

export const OpportunityScoutJobDataSchema = JobDataEnvelopeSchema.extend({
  projectId: ProjectIdSchema,
  runId: z.string().min(1),
  maxBriefs: z.number().int().positive().max(12).optional()
}).strict();

export const PageProposalJobDataSchema = JobDataEnvelopeSchema.extend({
  projectId: ProjectIdSchema,
  runId: z.string().min(1),
  opportunityId: z.string().min(1)
}).strict();

export const SectionCopySuggestionJobDataSchema = JobDataEnvelopeSchema.extend({
  projectId: ProjectIdSchema,
  runId: z.string().min(1),
  suggestionId: z.string().min(1),
  pageVersionId: z.string().min(1),
  sectionId: z.string().trim().min(1).max(120)
}).strict();

export const MediaProcessingJobDataSchema = JobDataEnvelopeSchema.extend({
  projectId: ProjectIdSchema,
  assetId: z.string().uuid()
}).strict();

export const SerpScoutJobDataSchema = SerpScoutRequestSchema.extend({
  snapshotId: z.string().min(1),
  agentRunId: z.string().min(1).optional()
})
  .merge(JobDataEnvelopeSchema)
  .strict();

export const TechnicalAuditJobDataSchema = JobDataEnvelopeSchema.extend({
  projectId: ProjectIdSchema,
  auditRunId: z.string().min(1),
  sourceUrl: WebsiteImportSourceUrlSchema
}).strict();

export const GscSyncQueueResponseSchema = z.union([QueueJobSchema, GscConnectionSchema]);
export const WebsiteImportQueueResponseSchema = QueueJobSchema.extend({
  importRunId: z.string().min(1).optional(),
  sourceUrl: WebsiteImportSourceUrlSchema.optional()
});
export const OpportunityScoutQueueResponseSchema = QueueJobSchema.extend({
  status: OpportunityScoutQueueStatusSchema,
  runId: z.string().min(1).optional()
});
export const OpportunityResearchQueueResponseSchema = QueueJobSchema.extend({
  type: z.literal("opportunity_research"),
  status: OpportunityScoutQueueStatusSchema,
  runId: z.string().uuid(),
  materialDigest: z
    .string()
    .regex(/^[0-9a-f]{64}$/u)
    .optional()
});
export const PageProposalQueueResponseSchema = QueueJobSchema.extend({
  status: PageProposalQueueStatusSchema,
  runId: z.string().min(1).optional(),
  opportunityId: z.string().min(1).optional()
});
export const SectionCopySuggestionQueueResponseSchema = QueueJobSchema.extend({
  type: z.literal("page_generation"),
  status: SectionCopySuggestionQueueStatusSchema,
  runId: z.string().min(1).optional(),
  suggestionId: z.string().min(1).optional(),
  pageVersionId: z.string().min(1),
  sectionId: PageStudioSectionIdSchema
});
export const SerpScoutQueueResponseSchema = QueueJobSchema.extend({
  snapshotId: z.string().min(1).optional(),
  query: z.string().trim().min(1).max(200).optional()
});
export const TechnicalAuditQueueResponseSchema = QueueJobSchema.extend({
  auditRunId: z.string().min(1).optional(),
  sourceUrl: WebsiteImportSourceUrlSchema.optional()
});
export const ReleaseVerificationQueueResponseSchema = QueueJobSchema.extend({
  status: ReleaseVerificationQueueStatusSchema,
  deploymentId: z.string().min(1).optional(),
  verificationId: z.string().min(1).optional()
});

export type QueueJob = z.output<typeof QueueJobSchema>;
export type DeployJobData = z.output<typeof DeployJobDataSchema>;
export type RollbackJobData = z.output<typeof RollbackJobDataSchema>;
export type ReleaseVerificationJobData = z.output<typeof ReleaseVerificationJobDataSchema>;
export type WebsiteImportJobData = z.output<typeof WebsiteImportJobDataSchema>;
export type OpportunityScoutJobData = z.output<typeof OpportunityScoutJobDataSchema>;
export type PageProposalJobData = z.output<typeof PageProposalJobDataSchema>;
export type SectionCopySuggestionJobData = z.output<typeof SectionCopySuggestionJobDataSchema>;
export type MediaProcessingJobData = z.output<typeof MediaProcessingJobDataSchema>;
export type TechnicalAuditJobData = z.output<typeof TechnicalAuditJobDataSchema>;
export type SerpScoutJobData = z.output<typeof SerpScoutJobDataSchema>;

export type GscSyncQueueResponse = z.output<typeof GscSyncQueueResponseSchema>;
export type WebsiteImportQueueResponse = z.output<typeof WebsiteImportQueueResponseSchema>;
export type OpportunityScoutQueueResponse = z.output<typeof OpportunityScoutQueueResponseSchema>;
export type PageProposalQueueResponse = z.output<typeof PageProposalQueueResponseSchema>;
export type SectionCopySuggestionQueueResponse = z.output<typeof SectionCopySuggestionQueueResponseSchema>;
export type SerpScoutQueueResponse = z.output<typeof SerpScoutQueueResponseSchema>;
export type TechnicalAuditQueueResponse = z.output<typeof TechnicalAuditQueueResponseSchema>;
export type ReleaseVerificationQueueResponse = z.output<typeof ReleaseVerificationQueueResponseSchema>;

export type JobType = z.output<typeof JobTypeSchema>;
export type OpportunityResearchQueueResponse = z.output<typeof OpportunityResearchQueueResponseSchema>;
