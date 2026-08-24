import { z } from "zod";

import { DateRangeSchema, ProjectIdSchema } from "./common.js";

export const gscConnectionStatuses = ["connection_required", "connected", "error", "revoked"] as const;

export const gscSyncStatuses = ["queued", "running", "completed", "failed", "cancelled"] as const;

export const gscOpportunitySignalTypes = [
  "impressions_no_clicks",
  "positions_11_100",
  "wrong_page_service_location",
  "service_location_query"
] as const;

export const gscOpportunitySignalStatuses = ["internal_radar", "near_term_target", "rejected", "promoted"] as const;

export const GscConnectionStatusSchema = z.enum(gscConnectionStatuses);
export const GscSyncStatusSchema = z.enum(gscSyncStatuses);
export const GscOpportunitySignalTypeSchema = z.enum(gscOpportunitySignalTypes);
export const GscOpportunitySignalStatusSchema = z.enum(gscOpportunitySignalStatuses);

export const GscPropertyUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) => value.startsWith("sc-domain:") || /^https?:\/\/.+/u.test(value),
    "Expected a Search Console URL-prefix property or sc-domain property"
  );

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
export type GscConnectionStatus = z.output<typeof GscConnectionStatusSchema>;
export type GscSyncStatus = z.output<typeof GscSyncStatusSchema>;
export type GscOpportunitySignalType = z.output<typeof GscOpportunitySignalTypeSchema>;
export type GscOpportunitySignalStatus = z.output<typeof GscOpportunitySignalStatusSchema>;
