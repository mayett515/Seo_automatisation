import { z } from "zod";

import { ProjectIdSchema } from "./common.js";

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

export const TrackingEventNameSchema = z.enum(trackingEventNames);

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

export const TrackingKeyListResponseSchema = z.object({
  projectId: ProjectIdSchema,
  keys: z.array(TrackingKeySummarySchema)
});

export type TrackingEvent = z.output<typeof TrackingEventSchema>;
export type TrackingIngestResult = z.output<typeof TrackingIngestResultSchema>;
export type CreateTrackingKeyRequest = z.output<typeof CreateTrackingKeyRequestSchema>;
export type TrackingKeySummary = z.output<typeof TrackingKeySummarySchema>;
export type CreateTrackingKeyResponse = z.output<typeof CreateTrackingKeyResponseSchema>;
export type TrackingKeyListResponse = z.output<typeof TrackingKeyListResponseSchema>;
