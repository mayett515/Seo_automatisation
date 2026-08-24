import { z } from "zod";

import {
  ApprovalStatusSchema,
  EvidenceSourceTypeSchema,
  ProjectIdSchema,
  ReleaseItemActionSchema,
  type ReleaseItemAction
} from "./common.js";
import { jobStatuses } from "./common.js";
import { OpportunityTargetRevisionSchema } from "./opportunities.js";

export const pageProposalQueueStatuses = [...jobStatuses, "already_active"] as const;
export const sectionCopySuggestionStatuses = [
  "queued",
  "generating",
  "ready",
  "failed",
  "applied",
  "dismissed"
] as const;
export const sectionCopySuggestionQueueStatuses = [...jobStatuses, "already_active"] as const;

export const pageSectionNoteInstructionTypes = [
  "general",
  "copy_change",
  "design_change",
  "seo_change",
  "evidence_request",
  "approval_blocker"
] as const;
export const pageVersionReviewDecisions = ["approve", "request_changes"] as const;

export const pageVersionStatuses = [
  "draft",
  "preview",
  "changes_requested",
  "approved",
  "release_candidate",
  "released",
  "superseded"
] as const;
export const pageZones = [
  "frame_top",
  "hero",
  "body_intro",
  "body_main",
  "proof_media",
  "body_late",
  "cta_late",
  "frame_bottom"
] as const;
export const pageSectionTypes = [
  "Header",
  "Hero",
  "ServiceIntro",
  "ProblemSolution",
  "ServiceDescription",
  "BenefitsGrid",
  "BulletList",
  "ServiceGrid",
  "ImageText",
  "Gallery",
  "Slideshow",
  "Carousel",
  "BeforeAfter",
  "TrustReviews",
  "References",
  "FAQ",
  "AreaMap",
  "NearbyPlaces",
  "ServiceAreaList",
  "InlineCTA",
  "FinalCTA",
  "Footer"
] as const;
export const pageTypes = ["home_page", "service_page", "service_area_page", "location_page", "landing_page"] as const;

export const PageProposalQueueStatusSchema = z.enum(pageProposalQueueStatuses);
export const SectionCopySuggestionStatusSchema = z.enum(sectionCopySuggestionStatuses);
export const SectionCopySuggestionQueueStatusSchema = z.enum(sectionCopySuggestionQueueStatuses);

export const PageVersionStatusSchema = z.enum(pageVersionStatuses);
export const PageSectionNoteInstructionTypeSchema = z.enum(pageSectionNoteInstructionTypes);
export const PageVersionReviewDecisionSchema = z.enum(pageVersionReviewDecisions);
export const PageZoneSchema = z.enum(pageZones);
export const PageSectionTypeSchema = z.enum(pageSectionTypes);
export const PageTypeSchema = z.enum(pageTypes);

export const CreatePageProposalRunRequestSchema = z
  .object({
    opportunityId: z.string().trim().min(1).max(200),
    expectedOpportunity: OpportunityTargetRevisionSchema
  })
  .strict();

export const CreateSectionCopySuggestionRequestSchema = z
  .object({
    sectionId: z.string().trim().min(1).max(120),
    instruction: z.string().trim().min(1).max(1_000).optional()
  })
  .strict();

export const PagePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .refine((value) => value.startsWith("/"), "Page paths must start with '/'.")
  .refine((value) => !value.startsWith("//"), "Page paths must not be protocol-relative URLs.")
  .refine((value) => !value.includes("\\"), "Page paths must not contain backslashes.");

export const PageMediaFocalPointSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1)
  })
  .strict();

export const PageMediaReferenceSchema = z.discriminatedUnion("purpose", [
  z
    .object({
      assetId: z.string().uuid(),
      purpose: z.literal("content"),
      alt: z.string().trim().min(1).max(300),
      focalPoint: PageMediaFocalPointSchema.optional()
    })
    .strict(),
  z
    .object({
      assetId: z.string().uuid(),
      purpose: z.literal("decorative"),
      alt: z.literal(""),
      focalPoint: PageMediaFocalPointSchema.optional()
    })
    .strict()
]);

export const PageEvidenceRefSchema = z
  .object({
    sourceType: EvidenceSourceTypeSchema,
    sourceId: z.string().trim().min(1).max(200).optional(),
    locator: z.record(z.string(), z.unknown()).optional(),
    note: z.string().trim().min(1).max(1_000).optional()
  })
  .strict();

export const PageGenerationSchema = z
  .object({
    source: z.enum(["human", "agent", "template", "import"]).default("human"),
    agentRunId: z.string().trim().min(1).max(200).optional(),
    templateId: z.string().trim().min(1).max(120).optional(),
    reason: z.string().trim().min(1).max(1_000).optional()
  })
  .strict();

export const PageSectionInstanceSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    type: PageSectionTypeSchema,
    registryKey: z.string().trim().min(1).max(160),
    schemaVersion: z.number().int().positive(),
    zone: PageZoneSchema,
    order: z.number().int().nonnegative(),
    variant: z.string().trim().min(1).max(120),
    props: z.record(z.string(), z.unknown()).default({}),
    evidenceRefs: z.array(PageEvidenceRefSchema).max(50).default([]),
    generation: PageGenerationSchema.optional()
  })
  .strict();

export const PageJsonSchema = z
  .object({
    schemaVersion: z.literal(1),
    route: PagePathSchema,
    pageType: PageTypeSchema,
    target: z
      .object({
        service: z.string().trim().min(1).max(160),
        location: z.string().trim().min(1).max(160).optional(),
        primaryKeyword: z.string().trim().min(1).max(200),
        secondaryKeywords: z.array(z.string().trim().min(1).max(200)).max(50).default([])
      })
      .strict(),
    seo: z
      .object({
        title: z.string().trim().min(1).max(70),
        metaDescription: z.string().trim().min(1).max(180),
        canonicalPath: PagePathSchema,
        robots: z.enum(["index", "noindex"]).default("noindex"),
        jsonLd: z.array(z.record(z.string(), z.unknown())).max(20).default([]),
        sitemapReady: z.boolean().default(false)
      })
      .strict(),
    sections: z.array(PageSectionInstanceSchema).min(1).max(80),
    internalLinks: z.array(PagePathSchema).max(100).default([]),
    evidenceRefs: z.array(PageEvidenceRefSchema).max(100).default([]),
    uniquenessRationale: z.string().trim().min(1).max(2_000).optional(),
    generation: PageGenerationSchema.optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    validatePageJsonSafety(value, ctx);
    validateUniqueSectionIds(value.sections, ctx);
  });

export const PageProposalJsonSchema = z
  .object({
    schemaVersion: z.literal(1),
    projectId: ProjectIdSchema,
    opportunityId: z.string().trim().min(1).max(200).optional(),
    route: PagePathSchema,
    primaryKeyword: z.string().trim().min(1).max(200),
    page: PageJsonSchema,
    evidenceRefs: z.array(PageEvidenceRefSchema).max(100).default([]),
    proposalRationale: z.string().trim().min(1).max(2_000).optional(),
    generation: PageGenerationSchema.optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    validatePageJsonSafety(value, ctx);

    if (value.page.route !== value.route) {
      ctx.addIssue({
        code: "custom",
        path: ["page", "route"],
        message: "PageProposalJson.page.route must match PageProposalJson.route."
      });
    }

    if (value.page.target.primaryKeyword !== value.primaryKeyword) {
      ctx.addIssue({
        code: "custom",
        path: ["page", "target", "primaryKeyword"],
        message: "PageProposalJson.page.target.primaryKeyword must match PageProposalJson.primaryKeyword."
      });
    }
  });

export const PageStudioSectionIdSchema = PageSectionInstanceSchema.shape.id;

export const SectionCopyRevisionOutputSchema = z
  .object({
    schemaVersion: z.literal(1),
    sectionId: PageStudioSectionIdSchema,
    suggestedFields: z
      .record(z.string().trim().min(1).max(120), z.unknown())
      .refine((value) => Object.keys(value).length > 0, "Section copy output must suggest at least one field.")
      .refine((value) => Object.keys(value).length <= 30, "Section copy output may suggest at most 30 fields.")
  })
  .strict();

export const PageStudioEditCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("update_section_props"),
      sectionId: PageStudioSectionIdSchema,
      props: PageSectionInstanceSchema.shape.props
    })
    .strict(),
  z
    .object({
      type: z.literal("move_section"),
      sectionId: PageStudioSectionIdSchema,
      direction: z.enum(["up", "down"])
    })
    .strict(),
  z
    .object({
      type: z.literal("switch_section_variant"),
      sectionId: PageStudioSectionIdSchema,
      variant: PageSectionInstanceSchema.shape.variant
    })
    .strict(),
  z
    .object({
      type: z.literal("replace_section"),
      sectionId: PageStudioSectionIdSchema,
      registryKey: PageSectionInstanceSchema.shape.registryKey,
      variant: PageSectionInstanceSchema.shape.variant,
      props: PageSectionInstanceSchema.shape.props
    })
    .strict()
]);

export const EditPageVersionRequestSchema = z
  .object({
    command: PageStudioEditCommandSchema,
    suggestionId: z.string().uuid().optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.suggestionId && value.command.type !== "update_section_props") {
      ctx.addIssue({
        code: "custom",
        path: ["suggestionId"],
        message: "Section copy suggestions can only be applied through update_section_props."
      });
    }
  });

const renderableReleaseItemActions = new Set<ReleaseItemAction>(["create", "update"]);

export const ApprovedReleaseArtifactPageSchema = z
  .object({
    releasePlanItemId: z.string().min(1),
    pageVersionId: z.string().min(1).nullable(),
    targetUrl: z.string().min(1),
    targetSubdomain: z.string().min(1).nullable(),
    action: ReleaseItemActionSchema,
    pageJson: PageJsonSchema.nullable()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (renderableReleaseItemActions.has(value.action) && value.pageJson === null) {
      ctx.addIssue({
        code: "custom",
        path: ["pageJson"],
        message: "Renderable release actions require PageJson."
      });
    }
  });

export const ApprovedReleaseArtifactSchema = z.object({
  projectId: ProjectIdSchema,
  releasePlanId: z.string().min(1),
  deploymentKey: z.string().min(1),
  createdAt: z.string().datetime(),
  pages: z.array(ApprovedReleaseArtifactPageSchema).min(1)
});

export const STATIC_SITE_ARTIFACT_MAX_DECODED_BYTES = 50 * 1024 * 1024;
const staticSiteBase64BodyMaxLength = Math.ceil(STATIC_SITE_ARTIFACT_MAX_DECODED_BYTES / 3) * 4;

const StaticSiteFilePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => value.startsWith("/"), "Static file paths must start with '/'.")
  .refine((value) => !value.startsWith("//"), "Static file paths must not be protocol-relative.")
  .refine((value) => !value.includes("\\"), "Static file paths must not contain backslashes.")
  .refine((value) => !/[?#]/u.test(value), "Static file paths must not contain query or fragment syntax.")
  .refine(
    (value) => !value.split("/").some((segment) => segment === "." || segment === ".."),
    "Static file paths must not contain traversal segments."
  );

const StaticSiteFileBaseSchema = z.object({
  path: StaticSiteFilePathSchema,
  contentType: z.string().trim().min(1).max(120)
});

export const StaticSiteFileSchema = z.discriminatedUnion("encoding", [
  StaticSiteFileBaseSchema.extend({
    encoding: z.literal("utf8"),
    body: z.string().max(STATIC_SITE_ARTIFACT_MAX_DECODED_BYTES)
  }).strict(),
  StaticSiteFileBaseSchema.extend({
    encoding: z.literal("base64"),
    body: z
      .string()
      .max(staticSiteBase64BodyMaxLength)
      .refine(isCanonicalBase64, "Base64 static file bodies must use canonical padded encoding.")
  }).strict()
]);

export function decodedStaticSiteFileByteLength(file: z.output<typeof StaticSiteFileSchema>): number {
  if (file.encoding === "utf8") {
    return new TextEncoder().encode(file.body).byteLength;
  }

  return decodedBase64ByteLength(file.body);
}

export const StaticSiteArtifactSchema = z
  .object({
    files: z.array(StaticSiteFileSchema).max(1_000)
  })
  .strict()
  .superRefine((value, ctx) => {
    const seenPaths = new Set<string>();
    let decodedBytes = 0;

    for (const [index, file] of value.files.entries()) {
      if (seenPaths.has(file.path)) {
        ctx.addIssue({
          code: "custom",
          path: ["files", index, "path"],
          message: `Static site artifact contains duplicate path '${file.path}'.`
        });
      }
      seenPaths.add(file.path);
      decodedBytes += decodedStaticSiteFileByteLength(file);
    }

    if (decodedBytes > STATIC_SITE_ARTIFACT_MAX_DECODED_BYTES) {
      ctx.addIssue({
        code: "custom",
        path: ["files"],
        message: "Static site artifact exceeds the 50 MiB decoded-byte budget."
      });
    }
  });

export const StaticSiteFileDescriptorSchema = z
  .object({
    path: StaticSiteFilePathSchema,
    contentType: z.string().trim().min(1).max(120),
    encoding: z.enum(["utf8", "base64"]),
    decodedBytes: z.number().int().nonnegative().max(STATIC_SITE_ARTIFACT_MAX_DECODED_BYTES)
  })
  .strict();

export const PageVersionSummarySchema = z
  .object({
    id: z.string().min(1),
    projectId: ProjectIdSchema,
    pageProposalId: z.string().min(1),
    opportunityId: z.string().min(1).optional(),
    route: PagePathSchema,
    primaryKeyword: z.string().trim().min(1).max(200),
    uniquenessRationale: z.string().trim().min(1).max(2_000),
    proposalStatus: z.string().trim().min(1).max(80),
    sitemapReady: z.boolean(),
    versionNumber: z.number().int().positive(),
    status: PageVersionStatusSchema,
    rowVersion: z.number().int().nonnegative().max(2_147_483_647),
    basedOnVersionId: z.string().min(1).optional(),
    createdByUserId: z.string().min(1).optional(),
    approvedAt: z.string().datetime().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .strict();

export const PageVersionDetailSchema = PageVersionSummarySchema.extend({
  pageJson: PageJsonSchema
}).strict();

export const PageVersionEditResponseSchema = z
  .object({
    projectId: ProjectIdSchema,
    basePageVersionId: z.string().min(1),
    pageVersion: PageVersionDetailSchema
  })
  .strict();

export const SectionCopySuggestionSchema = z
  .object({
    id: z.string().min(1),
    projectId: ProjectIdSchema,
    pageVersionId: z.string().min(1),
    sectionId: PageStudioSectionIdSchema,
    agentRunId: z.string().min(1),
    status: SectionCopySuggestionStatusSchema,
    instruction: z.string().trim().min(1).max(1_000).optional(),
    suggestedProps: z.record(z.string(), z.unknown()).optional(),
    failureCode: z.string().trim().min(1).max(120).optional(),
    failureMessage: z.string().trim().min(1).max(500).optional(),
    requestedByUserId: z.string().min(1),
    appliedPageVersionId: z.string().min(1).optional(),
    appliedByUserId: z.string().min(1).optional(),
    dismissedByUserId: z.string().min(1).optional(),
    readyAt: z.string().datetime().optional(),
    appliedAt: z.string().datetime().optional(),
    dismissedAt: z.string().datetime().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .strict();

export const SectionCopySuggestionListResponseSchema = z
  .object({
    projectId: ProjectIdSchema,
    pageVersionId: z.string().min(1),
    suggestions: z.array(SectionCopySuggestionSchema).max(100)
  })
  .strict();

export const PageVersionListResponseSchema = z
  .object({
    projectId: ProjectIdSchema,
    pageVersions: z.array(PageVersionSummarySchema).max(500)
  })
  .strict();

export const PageProposalSummarySchema = z
  .object({
    id: z.string().min(1),
    projectId: ProjectIdSchema,
    opportunityId: z.string().min(1).optional(),
    route: PagePathSchema,
    primaryKeyword: z.string().trim().min(1).max(200),
    uniquenessRationale: z.string().trim().min(1).max(2_000),
    status: z.string().trim().min(1).max(80),
    sitemapReady: z.boolean(),
    versionCount: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .strict();

export const PageProposalDetailSchema = PageProposalSummarySchema.extend({
  proposalJson: PageProposalJsonSchema.optional(),
  versions: z.array(PageVersionSummarySchema).max(500)
}).strict();

export const PageProposalListResponseSchema = z
  .object({
    projectId: ProjectIdSchema,
    pageProposals: z.array(PageProposalSummarySchema).max(500)
  })
  .strict();

export const PageVersionPreviewResponseSchema = z
  .object({
    projectId: ProjectIdSchema,
    pageVersionId: z.string().min(1),
    route: PagePathSchema,
    mode: z.literal("editor"),
    documentPath: z.string().trim().min(1).max(1_000).startsWith("/"),
    file: StaticSiteFileDescriptorSchema
  })
  .strict();

function isCanonicalBase64(value: string): boolean {
  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value);
}

function decodedBase64ByteLength(value: string): number {
  if (value.length === 0) {
    return 0;
  }

  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

export const PageSectionNoteFieldPathSchema = z
  .array(z.union([z.string().trim().min(1).max(120), z.number().int().nonnegative()]))
  .max(20);

export const PageSectionNoteSchema = z
  .object({
    id: z.string().min(1),
    projectId: ProjectIdSchema,
    pageVersionId: z.string().min(1),
    sectionId: z.string().trim().min(1).max(120),
    fieldPath: PageSectionNoteFieldPathSchema,
    instructionType: PageSectionNoteInstructionTypeSchema,
    note: z.string().trim().min(1).max(2_000),
    status: z.enum(["open", "resolved"]),
    createdByUserId: z.string().min(1).optional(),
    resolvedByUserId: z.string().min(1).optional(),
    resolvedAt: z.string().datetime().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .strict();

export const CreatePageSectionNoteRequestSchema = z
  .object({
    sectionId: z.string().trim().min(1).max(120),
    fieldPath: PageSectionNoteFieldPathSchema.default([]),
    instructionType: PageSectionNoteInstructionTypeSchema.default("general"),
    note: z.string().trim().min(1).max(2_000)
  })
  .strict();

export const PageSectionNoteListResponseSchema = z
  .object({
    projectId: ProjectIdSchema,
    pageVersionId: z.string().min(1),
    notes: z.array(PageSectionNoteSchema).max(500)
  })
  .strict();

export const ReviewPageVersionRequestSchema = z
  .object({
    decision: PageVersionReviewDecisionSchema,
    decisionNote: z.string().trim().min(1).max(2_000).optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.decision === "request_changes" && !value.decisionNote) {
      ctx.addIssue({
        code: "custom",
        path: ["decisionNote"],
        message: "Requesting changes requires a decision note."
      });
    }
  });

export const PageVersionApprovalRecordSchema = z
  .object({
    id: z.string().min(1),
    projectId: ProjectIdSchema,
    pageVersionId: z.string().min(1),
    status: ApprovalStatusSchema.extract(["approved", "rejected"]),
    decisionNote: z.string().min(1).optional(),
    decidedByUserId: z.string().min(1).optional(),
    decidedAt: z.string().datetime(),
    createdAt: z.string().datetime()
  })
  .strict();

export const PageVersionReviewResponseSchema = z
  .object({
    projectId: ProjectIdSchema,
    pageVersion: PageVersionSummarySchema,
    approval: PageVersionApprovalRecordSchema
  })
  .strict();

export const PageVersionTargetRevisionSchema = z
  .object({
    status: PageVersionStatusSchema,
    rowVersion: z.number().int().nonnegative().max(2_147_483_647)
  })
  .strict();

export const ReleasePlanPageVersionTargetSchema = z
  .object({
    pageVersionId: z.string().uuid(),
    expected: PageVersionTargetRevisionSchema
  })
  .strict();

export const CreateReleasePlanRequestSchema = z
  .object({
    pageVersions: z.array(ReleasePlanPageVersionTargetSchema).min(1).max(50)
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    for (const [index, target] of value.pageVersions.entries()) {
      if (seen.has(target.pageVersionId)) {
        context.addIssue({
          code: "custom",
          path: ["pageVersions", index, "pageVersionId"],
          message: "Release plan page-version targets must be unique."
        });
      }
      seen.add(target.pageVersionId);
    }
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

const pageJsonForbiddenKeys = new Set([
  "html",
  "css",
  "script",
  "jsx",
  "dangerouslysetinnerhtml",
  "class",
  "classname",
  "style",
  "rawmarkup",
  "innerhtml",
  "srcdoc"
]);

const pageJsonGuardMaxDepth = 32;
const pageJsonGuardMaxNodes = 5_000;

function validateUniqueSectionIds(sections: readonly PageSectionInstance[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>();

  sections.forEach((section, index) => {
    if (seen.has(section.id)) {
      ctx.addIssue({
        code: "custom",
        path: ["sections", index, "id"],
        message: `Duplicate PageJson section id '${section.id}'.`
      });
      return;
    }

    seen.add(section.id);
  });
}

function validatePageJsonSafety(value: unknown, ctx: z.RefinementCtx): void {
  const state = { nodes: 0, overflowReported: false };
  scanPageJsonValue(value, ctx, [], 0, state);
}

function scanPageJsonValue(
  value: unknown,
  ctx: z.RefinementCtx,
  path: Array<string | number>,
  depth: number,
  state: { nodes: number; overflowReported: boolean }
): void {
  state.nodes += 1;

  if (state.nodes > pageJsonGuardMaxNodes) {
    if (!state.overflowReported) {
      ctx.addIssue({
        code: "custom",
        path,
        message: `PageJson exceeds the safety scan limit of ${pageJsonGuardMaxNodes} nodes.`
      });
      state.overflowReported = true;
    }

    return;
  }

  if (depth > pageJsonGuardMaxDepth) {
    ctx.addIssue({
      code: "custom",
      path,
      message: `PageJson exceeds the safety scan depth of ${pageJsonGuardMaxDepth}.`
    });
    return;
  }

  if (typeof value === "string") {
    const normalized = normalizePotentiallyDangerousUrl(value);

    if (normalized.startsWith("javascript:") || normalized.startsWith("data:text/html")) {
      ctx.addIssue({
        code: "custom",
        path,
        message: "PageJson must not contain javascript: or data:text/html string values."
      });
    }

    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => scanPageJsonValue(item, ctx, [...path, index], depth + 1, state));
    return;
  }

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.trim().toLowerCase();

    if (pageJsonForbiddenKeys.has(normalizedKey) || /^on[A-Za-z0-9_-]+$/u.test(key)) {
      ctx.addIssue({
        code: "custom",
        path: [...path, key],
        message: `PageJson must not contain raw markup, styling, script, class, inline-style, or event-handler key '${key}'.`
      });
    }

    scanPageJsonValue(nestedValue, ctx, [...path, key], depth + 1, state);
  }
}

function normalizePotentiallyDangerousUrl(value: string): string {
  return stripAsciiControlCharacters(value.trim()).toLowerCase();
}

function stripAsciiControlCharacters(value: string): string {
  let result = "";

  for (const character of value) {
    const code = character.charCodeAt(0);

    if ((code >= 0 && code <= 31) || code === 127) {
      continue;
    }

    result += character;
  }

  return result;
}

export type PageEvidenceRef = z.output<typeof PageEvidenceRefSchema>;
export type PageMediaReference = z.output<typeof PageMediaReferenceSchema>;
export type PageGeneration = z.output<typeof PageGenerationSchema>;
export type PageSectionInstance = z.output<typeof PageSectionInstanceSchema>;
export type PageJson = z.output<typeof PageJsonSchema>;
export type PageProposalJson = z.output<typeof PageProposalJsonSchema>;
export type SectionCopyRevisionOutput = z.output<typeof SectionCopyRevisionOutputSchema>;
export type PageStudioEditCommand = z.output<typeof PageStudioEditCommandSchema>;
export type EditPageVersionRequest = z.output<typeof EditPageVersionRequestSchema>;
export type ApprovedReleaseArtifact = z.output<typeof ApprovedReleaseArtifactSchema>;
export type ApprovedReleaseArtifactPage = z.output<typeof ApprovedReleaseArtifactPageSchema>;
export type StaticSiteFile = z.output<typeof StaticSiteFileSchema>;
export type StaticSiteFileDescriptor = z.output<typeof StaticSiteFileDescriptorSchema>;
export type StaticSiteArtifact = z.output<typeof StaticSiteArtifactSchema>;
export type PageVersionSummary = z.output<typeof PageVersionSummarySchema>;
export type PageVersionDetail = z.output<typeof PageVersionDetailSchema>;
export type PageVersionEditResponse = z.output<typeof PageVersionEditResponseSchema>;
export type SectionCopySuggestion = z.output<typeof SectionCopySuggestionSchema>;
export type SectionCopySuggestionStatus = z.output<typeof SectionCopySuggestionStatusSchema>;
export type SectionCopySuggestionListResponse = z.output<typeof SectionCopySuggestionListResponseSchema>;
export type PageVersionListResponse = z.output<typeof PageVersionListResponseSchema>;
export type PageProposalSummary = z.output<typeof PageProposalSummarySchema>;
export type PageProposalDetail = z.output<typeof PageProposalDetailSchema>;
export type PageProposalListResponse = z.output<typeof PageProposalListResponseSchema>;
export type PageVersionPreviewResponse = z.output<typeof PageVersionPreviewResponseSchema>;
export type PageSectionNoteFieldPath = z.output<typeof PageSectionNoteFieldPathSchema>;
export type PageSectionNoteInstructionType = z.output<typeof PageSectionNoteInstructionTypeSchema>;
export type PageSectionNote = z.output<typeof PageSectionNoteSchema>;
export type CreatePageSectionNoteRequest = z.output<typeof CreatePageSectionNoteRequestSchema>;
export type PageSectionNoteListResponse = z.output<typeof PageSectionNoteListResponseSchema>;
export type PageVersionReviewDecision = z.output<typeof PageVersionReviewDecisionSchema>;
export type ReviewPageVersionRequest = z.output<typeof ReviewPageVersionRequestSchema>;
export type PageVersionApprovalRecord = z.output<typeof PageVersionApprovalRecordSchema>;
export type PageVersionReviewResponse = z.output<typeof PageVersionReviewResponseSchema>;
export type PageProposal = z.output<typeof PageProposalSchema>;
export type CreatePageProposalRunRequest = z.output<typeof CreatePageProposalRunRequestSchema>;
export type CreateSectionCopySuggestionRequest = z.output<typeof CreateSectionCopySuggestionRequestSchema>;
export type PageVersionTargetRevision = z.output<typeof PageVersionTargetRevisionSchema>;
export type ReleasePlanPageVersionTarget = z.output<typeof ReleasePlanPageVersionTargetSchema>;
export type CreateReleasePlanRequest = z.output<typeof CreateReleasePlanRequestSchema>;
export type PageProposalQueueStatus = z.output<typeof PageProposalQueueStatusSchema>;
export type PageVersionStatus = z.output<typeof PageVersionStatusSchema>;
export type PageZone = z.output<typeof PageZoneSchema>;
export type PageSectionType = z.output<typeof PageSectionTypeSchema>;
export type PageType = z.output<typeof PageTypeSchema>;
