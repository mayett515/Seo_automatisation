import { z } from "zod";

import { HttpUrlSchema, ProjectIdSchema } from "./common.js";
import { jobStatuses } from "./common.js";
import { QueueJobSchema } from "./jobs.js";
import { PagePathSchema } from "./pages.js";

export const mediaAssetStatuses = ["pending_upload", "processing", "ready", "failed", "archived"] as const;
export const mediaUploadContentTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const mediaProcessingQueueStatuses = [...jobStatuses, "already_active"] as const;

export const MediaAssetStatusSchema = z.enum(mediaAssetStatuses);
export const MediaUploadContentTypeSchema = z.enum(mediaUploadContentTypes);
export const MediaProcessingQueueStatusSchema = z.enum(mediaProcessingQueueStatuses);

export const MediaSha256Schema = z
  .string()
  .regex(/^[0-9a-f]{64}$/u, "Expected a lowercase hexadecimal SHA-256 digest.");

export const CreateMediaUploadIntentRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(255),
    claimedContentType: MediaUploadContentTypeSchema,
    expectedBytes: z
      .number()
      .int()
      .min(1)
      .max(10 * 1024 * 1024),
    expectedSha256: MediaSha256Schema
  })
  .strict();

export const MediaAssetVariantSchema = z
  .object({
    variantKey: z.string().regex(/^w[1-9][0-9]*_webp$/u),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    contentType: z.literal("image/webp"),
    byteSize: z.number().int().positive(),
    sha256: MediaSha256Schema
  })
  .strict();

export const MediaAssetSummarySchema = z
  .object({
    id: z.string().uuid(),
    projectId: ProjectIdSchema,
    status: MediaAssetStatusSchema,
    displayName: z.string().min(1).max(255),
    claimedContentType: MediaUploadContentTypeSchema,
    expectedBytes: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024),
    expectedSha256: MediaSha256Schema,
    detectedContentType: MediaUploadContentTypeSchema.optional(),
    sourceBytes: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024)
      .optional(),
    checksumSha256: MediaSha256Schema.optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    processorVersion: z.string().min(1).max(80).optional(),
    variants: z.array(MediaAssetVariantSchema).max(4).default([]),
    failureCode: z.string().min(1).max(120).optional(),
    failureMessage: z.string().min(1).max(500).optional(),
    createdByUserId: z.string().uuid(),
    archivedByUserId: z.string().uuid().optional(),
    readyAt: z.string().datetime().optional(),
    archivedAt: z.string().datetime().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .strict();

export const MediaUploadTargetSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("presigned_post"),
      url: HttpUrlSchema,
      fields: z.record(z.string(), z.string()).refine((value) => Object.keys(value).length > 0),
      expiresAt: z.string().datetime()
    })
    .strict(),
  z
    .object({
      kind: z.literal("api_put"),
      url: PagePathSchema,
      headers: z.record(z.string(), z.string()).refine((value) => Object.keys(value).length > 0),
      expiresAt: z.string().datetime()
    })
    .strict()
]);

export const MediaUploadIntentResponseSchema = z
  .object({
    asset: MediaAssetSummarySchema,
    upload: MediaUploadTargetSchema
  })
  .strict();

export const CompleteMediaUploadRequestSchema = z.object({}).strict();

export const MediaUploadCompletionResponseSchema = z
  .object({
    asset: MediaAssetSummarySchema,
    processing: QueueJobSchema.extend({
      type: z.literal("media_processing"),
      status: MediaProcessingQueueStatusSchema
    })
  })
  .strict();

export const MediaAssetListResponseSchema = z
  .object({
    projectId: ProjectIdSchema,
    assets: z.array(MediaAssetSummarySchema).max(500)
  })
  .strict();

export type MediaAssetStatus = z.output<typeof MediaAssetStatusSchema>;
export type MediaUploadContentType = z.output<typeof MediaUploadContentTypeSchema>;
export type MediaProcessingQueueStatus = z.output<typeof MediaProcessingQueueStatusSchema>;
export type CreateMediaUploadIntentRequest = z.output<typeof CreateMediaUploadIntentRequestSchema>;
export type MediaAssetVariant = z.output<typeof MediaAssetVariantSchema>;
export type MediaAssetSummary = z.output<typeof MediaAssetSummarySchema>;
export type MediaUploadTarget = z.output<typeof MediaUploadTargetSchema>;
export type MediaUploadIntentResponse = z.output<typeof MediaUploadIntentResponseSchema>;
export type MediaUploadCompletionResponse = z.output<typeof MediaUploadCompletionResponseSchema>;
export type MediaAssetListResponse = z.output<typeof MediaAssetListResponseSchema>;
