import { z } from "zod";

import { LeadIdSchema, ProjectIdSchema } from "./common.js";

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

export type CreateLeadInput = z.output<typeof CreateLeadSchema>;
export type Lead = z.output<typeof LeadSchema>;
export type PotentialReport = z.output<typeof PotentialReportSchema>;
export type ProjectSummary = z.output<typeof ProjectSummarySchema>;
export type MainPreview = z.output<typeof MainPreviewSchema>;
