import { z } from "zod";

import { HttpUrlSchema, ProjectIdSchema } from "./common.js";

export const websiteImportStatuses = ["queued", "running", "completed", "failed"] as const;
export const technicalAuditStatuses = ["queued", "running", "completed", "failed"] as const;

export const technicalAuditFindingSeverities = ["info", "warning", "blocker"] as const;
export const technicalAuditFindingCategories = [
  "http_status",
  "indexability",
  "canonical",
  "metadata",
  "schema",
  "internal_links",
  "crawl"
] as const;

export const WebsiteImportStatusSchema = z.enum(websiteImportStatuses);
export const TechnicalAuditStatusSchema = z.enum(technicalAuditStatuses);

export const TechnicalAuditFindingSeveritySchema = z.enum(technicalAuditFindingSeverities);
export const TechnicalAuditFindingCategorySchema = z.enum(technicalAuditFindingCategories);

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

export const CreateTechnicalAuditRunRequestSchema = z
  .object({
    sourceUrl: WebsiteImportSourceUrlSchema.optional()
  })
  .strict();

export const WebsiteImportRunSchema = z.object({
  importRunId: z.string().min(1),
  projectId: ProjectIdSchema,
  sourceUrl: WebsiteImportSourceUrlSchema,
  status: WebsiteImportStatusSchema,
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

export const TechnicalAuditFindingSchema = z.object({
  id: z.string().min(1),
  projectId: ProjectIdSchema,
  auditRunId: z.string().min(1),
  checkKey: z.string().trim().min(1).max(160),
  category: TechnicalAuditFindingCategorySchema,
  severity: TechnicalAuditFindingSeveritySchema,
  route: z.string().min(1).optional(),
  pageUrl: HttpUrlSchema.optional(),
  message: z.string().trim().min(1).max(1_000),
  evidence: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime()
});

export const TechnicalAuditRunSchema = z.object({
  auditRunId: z.string().min(1),
  projectId: ProjectIdSchema,
  sourceUrl: WebsiteImportSourceUrlSchema,
  status: TechnicalAuditStatusSchema,
  artifactKey: z.string().min(1).optional(),
  summary: z.record(z.string(), z.unknown()).optional(),
  failure: z.record(z.string(), z.unknown()).optional(),
  findings: z.array(TechnicalAuditFindingSchema).default([]),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional()
});

export const LatestTechnicalAuditResponseSchema = z.object({
  projectId: ProjectIdSchema,
  auditRun: TechnicalAuditRunSchema.optional()
});

export type WebsiteImportRun = z.output<typeof WebsiteImportRunSchema>;
export type LatestWebsiteImportResponse = z.output<typeof LatestWebsiteImportResponseSchema>;
export type TechnicalAuditFinding = z.output<typeof TechnicalAuditFindingSchema>;
export type TechnicalAuditRun = z.output<typeof TechnicalAuditRunSchema>;
export type LatestTechnicalAuditResponse = z.output<typeof LatestTechnicalAuditResponseSchema>;

export type CreateTechnicalAuditRunRequest = z.output<typeof CreateTechnicalAuditRunRequestSchema>;

export type WebsiteImportStatus = z.output<typeof WebsiteImportStatusSchema>;
export type TechnicalAuditStatus = z.output<typeof TechnicalAuditStatusSchema>;

export type TechnicalAuditFindingSeverity = z.output<typeof TechnicalAuditFindingSeveritySchema>;
export type TechnicalAuditFindingCategory = z.output<typeof TechnicalAuditFindingCategorySchema>;
