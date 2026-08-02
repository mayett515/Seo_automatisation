import { z } from "zod";

export const customerReportKinds = ["monthly_seo_progress"] as const;
export const customerReportStatuses = ["draft", "ready_for_review", "published", "superseded"] as const;
export const customerReportGenerationStatuses = [
  "queued",
  "assembling",
  "narrative_running",
  "validating",
  "succeeded",
  "failed",
  "cancelled",
  "stale"
] as const;
export const customerReportClaimKinds = [
  "ranking_result",
  "page_delivery",
  "provider_handoff",
  "live_health",
  "release_warning",
  "rollback_correction",
  "future_opportunity"
] as const;
export const customerReportSections = [
  "ranking_results",
  "page_delivery",
  "live_health",
  "warnings",
  "rollback_corrections",
  "future_opportunities"
] as const;
export const customerReportEvidenceKinds = [
  "ranking_proof",
  "page_version",
  "deployment",
  "release_verification",
  "release_verification_check",
  "rollback",
  "opportunity"
] as const;
export const customerReportNavigationTargets = ["opportunity", "page_studio_review", "release_review"] as const;

export const CustomerReportKindSchema = z.enum(customerReportKinds);
export const CustomerReportStatusSchema = z.enum(customerReportStatuses);
export const CustomerReportGenerationStatusSchema = z.enum(customerReportGenerationStatuses);
export const CustomerReportClaimKindSchema = z.enum(customerReportClaimKinds);
export const CustomerReportSectionSchema = z.enum(customerReportSections);
export const CustomerReportEvidenceKindSchema = z.enum(customerReportEvidenceKinds);
export const CustomerReportNavigationTargetSchema = z.enum(customerReportNavigationTargets);

export const CustomerReportSha256Schema = z.string().regex(/^[0-9a-f]{64}$/u, "Expected a lowercase SHA-256 digest.");
export const CustomerReportMonthSchema = z
  .string()
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u, "Expected a canonical YYYY-MM report period.");
export const CustomerReportLocaleSchema = z.literal("de-DE");
export const CustomerReportTimezoneSchema = z.literal("Europe/Berlin");
export const CustomerReportTimestampSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

const ReportUuidSchema = z.string().uuid();
const ReportVersionTokenSchema = reportText(80).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
const ReportLogicalKeySchema = reportText(120).regex(/^[a-z0-9][a-z0-9._:-]*$/u);
const ReportUrlSchema = reportText(2_000)
  .url()
  .refine((value) => isHttpUrl(value), "Report URLs must use http or https.");
const ReportPathSchema = reportText(500)
  .startsWith("/")
  .refine((value) => !value.startsWith("//"), "Report paths must not be protocol-relative.")
  .refine((value) => !value.includes("\\"), "Report paths must not contain backslashes.");
const ReportPositiveIntegerSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const CustomerReportIdentitySchema = z
  .object({
    projectId: ReportUuidSchema,
    reportKind: CustomerReportKindSchema,
    period: CustomerReportMonthSchema,
    locale: CustomerReportLocaleSchema,
    timezone: CustomerReportTimezoneSchema
  })
  .strict();

const EvidenceBaseSchema = z
  .object({
    evidenceKey: ReportLogicalKeySchema,
    projectId: ReportUuidSchema,
    sourceId: ReportUuidSchema,
    sourceVersion: ReportVersionTokenSchema,
    observedAt: CustomerReportTimestampSchema,
    selectedAtCutoff: CustomerReportTimestampSchema,
    payloadSha256: CustomerReportSha256Schema,
    customerLabel: reportText(240)
  })
  .strict();

export const RankingReportEvidenceSchema = EvidenceBaseSchema.extend({
  sourceKind: z.literal("ranking_proof"),
  proofTier: z.literal("customer_safe_proof"),
  query: reportText(200),
  pageUrl: ReportUrlSchema,
  rank: ReportPositiveIntegerSchema.max(10),
  searchEngine: reportText(80),
  device: z.enum(["desktop", "mobile"]),
  locale: reportText(80),
  status: z.literal("reviewed")
}).strict();

export const PageVersionReportEvidenceSchema = EvidenceBaseSchema.extend({
  sourceKind: z.literal("page_version"),
  proofTier: z.literal("customer_safe_proof"),
  pageVersionId: ReportUuidSchema,
  route: ReportPathSchema,
  versionNumber: ReportPositiveIntegerSchema,
  status: z.enum(["approved", "release_candidate", "released", "superseded"]),
  approvedAt: CustomerReportTimestampSchema
}).strict();

export const DeploymentReportEvidenceSchema = EvidenceBaseSchema.extend({
  sourceKind: z.literal("deployment"),
  proofTier: z.literal("customer_safe_proof"),
  deploymentId: ReportUuidSchema,
  provider: reportText(80),
  providerDeployId: reportText(200),
  status: z.enum(["provider_succeeded", "verifying", "live_healthy", "live_with_warnings", "rolled_back"]),
  handedOffAt: CustomerReportTimestampSchema
}).strict();

export const ReleaseVerificationReportEvidenceSchema = EvidenceBaseSchema.extend({
  sourceKind: z.literal("release_verification"),
  proofTier: z.literal("customer_safe_proof"),
  verificationId: ReportUuidSchema,
  deploymentId: ReportUuidSchema,
  status: z.enum(["live_healthy", "live_with_warnings"]),
  checkedAt: CustomerReportTimestampSchema
}).strict();

export const ReleaseVerificationCheckReportEvidenceSchema = EvidenceBaseSchema.extend({
  sourceKind: z.literal("release_verification_check"),
  proofTier: z.literal("customer_safe_proof"),
  verificationId: ReportUuidSchema,
  checkKey: ReportLogicalKeySchema,
  severity: z.enum(["warning", "blocker"]),
  result: z.literal("failed"),
  summary: reportText(1_000),
  checkedAt: CustomerReportTimestampSchema
}).strict();

export const RollbackReportEvidenceSchema = EvidenceBaseSchema.extend({
  sourceKind: z.literal("rollback"),
  proofTier: z.literal("customer_safe_proof"),
  rollbackPointId: ReportUuidSchema,
  deploymentId: ReportUuidSchema,
  status: z.literal("rolled_back"),
  rolledBackAt: CustomerReportTimestampSchema
}).strict();

export const OpportunityReportEvidenceSchema = EvidenceBaseSchema.extend({
  sourceKind: z.literal("opportunity"),
  proofTier: z.literal("supporting_context"),
  opportunityId: ReportUuidSchema,
  classification: z.enum(["near_term_target", "internal_radar"]),
  status: z.enum(["new", "monitoring", "held", "brief_created"]),
  title: reportText(240)
}).strict();

export const CustomerReportEvidenceItemSchema = z.discriminatedUnion("sourceKind", [
  RankingReportEvidenceSchema,
  PageVersionReportEvidenceSchema,
  DeploymentReportEvidenceSchema,
  ReleaseVerificationReportEvidenceSchema,
  ReleaseVerificationCheckReportEvidenceSchema,
  RollbackReportEvidenceSchema,
  OpportunityReportEvidenceSchema
]);

const EvidenceKeysSchema = uniqueLogicalKeys(1, 20, "evidence key");
const ActionSupportingClaimKeysSchema = uniqueLogicalKeys(1, 20, "supporting claim key");
const NarrativeSupportingClaimKeysSchema = uniqueLogicalKeys(0, 20, "supporting claim key");

const ClaimBaseSchema = z
  .object({
    claimKey: ReportLogicalKeySchema,
    evidenceKeys: EvidenceKeysSchema
  })
  .strict();

export const RankingResultReportClaimSchema = ClaimBaseSchema.extend({
  kind: z.literal("ranking_result"),
  section: z.literal("ranking_results"),
  query: reportText(200),
  pageUrl: ReportUrlSchema,
  rank: ReportPositiveIntegerSchema.max(10),
  milestone: z.enum(["top_10", "top_5", "top_3", "rank_2", "rank_1"])
}).strict();

export const PageDeliveryReportClaimSchema = ClaimBaseSchema.extend({
  kind: z.literal("page_delivery"),
  section: z.literal("page_delivery"),
  pageVersionId: ReportUuidSchema,
  route: ReportPathSchema,
  versionNumber: ReportPositiveIntegerSchema,
  deliveryState: z.enum(["approved_content", "released_content"])
}).strict();

export const ProviderHandoffReportClaimSchema = ClaimBaseSchema.extend({
  kind: z.literal("provider_handoff"),
  section: z.literal("page_delivery"),
  deploymentId: ReportUuidSchema,
  provider: reportText(80),
  handedOffAt: CustomerReportTimestampSchema
}).strict();

export const LiveHealthReportClaimSchema = ClaimBaseSchema.extend({
  kind: z.literal("live_health"),
  section: z.literal("live_health"),
  verificationId: ReportUuidSchema,
  deploymentId: ReportUuidSchema,
  health: z.enum(["live_healthy", "live_with_warnings"]),
  checkedAt: CustomerReportTimestampSchema
}).strict();

export const ReleaseWarningReportClaimSchema = ClaimBaseSchema.extend({
  kind: z.literal("release_warning"),
  section: z.literal("warnings"),
  verificationId: ReportUuidSchema,
  checkKey: ReportLogicalKeySchema,
  title: reportText(240),
  summary: reportText(1_000)
}).strict();

export const RollbackCorrectionReportClaimSchema = ClaimBaseSchema.extend({
  kind: z.literal("rollback_correction"),
  section: z.literal("rollback_corrections"),
  rollbackPointId: ReportUuidSchema,
  deploymentId: ReportUuidSchema,
  verificationId: ReportUuidSchema,
  outcome: z.enum(["rolled_back_with_live_verification", "correction_verified"]),
  occurredAt: CustomerReportTimestampSchema,
  verifiedAt: CustomerReportTimestampSchema
})
  .strict()
  .superRefine((claim, context) => {
    if (Date.parse(claim.verifiedAt) <= Date.parse(claim.occurredAt)) {
      context.addIssue({
        code: "custom",
        message: "Rollback correction verification must occur after the rollback.",
        path: ["verifiedAt"]
      });
    }
  });

export const FutureOpportunityReportClaimSchema = ClaimBaseSchema.extend({
  kind: z.literal("future_opportunity"),
  section: z.literal("future_opportunities"),
  opportunityId: ReportUuidSchema,
  title: reportText(240),
  recommendedAction: z.enum(["monitor", "create_brief", "create_page_proposal", "hold"])
}).strict();

export const CustomerReportClaimSchema = z.discriminatedUnion("kind", [
  RankingResultReportClaimSchema,
  PageDeliveryReportClaimSchema,
  ProviderHandoffReportClaimSchema,
  LiveHealthReportClaimSchema,
  ReleaseWarningReportClaimSchema,
  RollbackCorrectionReportClaimSchema,
  FutureOpportunityReportClaimSchema
]);

export const CustomerReportNavigationRefSchema = z
  .object({
    actionKey: ReportLogicalKeySchema,
    kind: z.literal("navigation_ref"),
    label: reportText(160),
    supportingClaimKeys: ActionSupportingClaimKeysSchema,
    target: z.discriminatedUnion("surface", [
      z.object({ surface: z.literal("opportunity"), opportunityId: ReportUuidSchema }).strict(),
      z.object({ surface: z.literal("page_studio_review"), pageVersionId: ReportUuidSchema }).strict(),
      z.object({ surface: z.literal("release_review"), releasePlanId: ReportUuidSchema }).strict()
    ])
  })
  .strict();

export const CustomerReportFactProjectionSchema = z
  .object({
    claims: z.array(CustomerReportClaimSchema).max(200),
    evidence: z.array(CustomerReportEvidenceItemSchema).max(400),
    nextActions: z.array(CustomerReportNavigationRefSchema).max(40)
  })
  .strict()
  .superRefine((projection, context) => {
    const claimKeys = uniqueSetOrIssue(
      projection.claims.map((claim) => claim.claimKey),
      "claim key",
      ["claims"],
      context
    );
    const evidenceKeys = uniqueSetOrIssue(
      projection.evidence.map((evidence) => evidence.evidenceKey),
      "evidence key",
      ["evidence"],
      context
    );
    uniqueSetOrIssue(
      projection.nextActions.map((action) => action.actionKey),
      "action key",
      ["nextActions"],
      context
    );

    const referencedEvidenceKeys = new Set(projection.claims.flatMap((claim) => claim.evidenceKeys));

    for (const claim of projection.claims) {
      for (const evidenceKey of claim.evidenceKeys) {
        if (!evidenceKeys.has(evidenceKey)) {
          context.addIssue({
            code: "custom",
            message: `Claim ${claim.claimKey} references missing evidence ${evidenceKey}.`,
            path: ["claims"]
          });
        }
      }
    }

    for (const evidenceKey of evidenceKeys) {
      if (!referencedEvidenceKeys.has(evidenceKey)) {
        context.addIssue({
          code: "custom",
          message: `Evidence ${evidenceKey} is not referenced by any claim.`,
          path: ["evidence"]
        });
      }
    }

    for (const action of projection.nextActions) {
      for (const claimKey of action.supportingClaimKeys) {
        if (!claimKeys.has(claimKey)) {
          context.addIssue({
            code: "custom",
            message: `Action ${action.actionKey} references missing claim ${claimKey}.`,
            path: ["nextActions"]
          });
        }
      }
    }
  });

export const CustomerReportNarrativeFragmentSchema = z
  .object({
    slotKey: ReportLogicalKeySchema,
    kind: z.enum(["heading", "transition"]),
    text: reportText(1_000),
    supportingClaimKeys: NarrativeSupportingClaimKeysSchema
  })
  .strict();

export const CustomerReportSnapshotSchema = z
  .object({
    schemaVersion: z.literal("customer_report_snapshot.v1"),
    identity: CustomerReportIdentitySchema,
    generatedAt: CustomerReportTimestampSchema,
    evidenceCutoffAt: CustomerReportTimestampSchema,
    assemblerVersion: ReportVersionTokenSchema,
    eligibilityPolicyVersion: ReportVersionTokenSchema,
    actionSelectionPolicyVersion: ReportVersionTokenSchema,
    narrativePolicyVersion: ReportVersionTokenSchema,
    templateVersion: ReportVersionTokenSchema,
    narrativeMode: z.enum(["fact_only", "bounded_ai"]),
    title: reportText(240),
    factProjectionSha256: CustomerReportSha256Schema,
    factProjection: CustomerReportFactProjectionSchema,
    narrative: z.array(CustomerReportNarrativeFragmentSchema).max(40)
  })
  .strict()
  .superRefine((snapshot, context) => {
    const claimKeys = new Set(snapshot.factProjection.claims.map((claim) => claim.claimKey));
    uniqueSetOrIssue(
      snapshot.narrative.map((fragment) => fragment.slotKey),
      "narrative slot key",
      ["narrative"],
      context
    );

    if (snapshot.narrativeMode === "fact_only" && snapshot.narrative.length > 0) {
      context.addIssue({
        code: "custom",
        message: "Fact-only reports must not contain AI narrative fragments.",
        path: ["narrative"]
      });
    }

    for (const evidence of snapshot.factProjection.evidence) {
      if (evidence.projectId !== snapshot.identity.projectId) {
        context.addIssue({
          code: "custom",
          message: `Evidence ${evidence.evidenceKey} belongs to a different project.`,
          path: ["factProjection", "evidence"]
        });
      }

      if (evidence.selectedAtCutoff !== snapshot.evidenceCutoffAt) {
        context.addIssue({
          code: "custom",
          message: `Evidence ${evidence.evidenceKey} was selected at a different cutoff.`,
          path: ["factProjection", "evidence"]
        });
      }
    }

    for (const fragment of snapshot.narrative) {
      for (const claimKey of fragment.supportingClaimKeys) {
        if (!claimKeys.has(claimKey)) {
          context.addIssue({
            code: "custom",
            message: `Narrative slot ${fragment.slotKey} references missing claim ${claimKey}.`,
            path: ["narrative"]
          });
        }
      }
    }
  });

export const ReportGeneratedEventSchema = z
  .object({
    eventName: z.literal("ReportGenerated"),
    projectId: ReportUuidSchema,
    reportIssueId: ReportUuidSchema,
    reportId: ReportUuidSchema,
    generationRunId: ReportUuidSchema,
    reportVersion: ReportPositiveIntegerSchema,
    reportStatus: z.literal("draft"),
    snapshotSha256: CustomerReportSha256Schema,
    occurredAt: CustomerReportTimestampSchema
  })
  .strict();

export const CustomerApprovedNextActionEventSchema = z
  .object({
    eventName: z.literal("CustomerApprovedNextAction"),
    projectId: ReportUuidSchema,
    reportId: ReportUuidSchema,
    actionKey: ReportLogicalKeySchema,
    receiptId: ReportUuidSchema,
    actorUserId: ReportUuidSchema,
    intentSha256: CustomerReportSha256Schema,
    consentStatus: z.literal("accepted"),
    occurredAt: CustomerReportTimestampSchema
  })
  .strict();

export const CustomerReportDomainEventSchema = z.discriminatedUnion("eventName", [
  ReportGeneratedEventSchema,
  CustomerApprovedNextActionEventSchema
]);

export type CustomerReportKind = z.output<typeof CustomerReportKindSchema>;
export type CustomerReportStatus = z.output<typeof CustomerReportStatusSchema>;
export type CustomerReportGenerationStatus = z.output<typeof CustomerReportGenerationStatusSchema>;
export type CustomerReportClaimKind = z.output<typeof CustomerReportClaimKindSchema>;
export type CustomerReportSection = z.output<typeof CustomerReportSectionSchema>;
export type CustomerReportEvidenceKind = z.output<typeof CustomerReportEvidenceKindSchema>;
export type CustomerReportIdentity = z.output<typeof CustomerReportIdentitySchema>;
export type CustomerReportEvidenceItem = z.output<typeof CustomerReportEvidenceItemSchema>;
export type CustomerReportClaim = z.output<typeof CustomerReportClaimSchema>;
export type CustomerReportNavigationRef = z.output<typeof CustomerReportNavigationRefSchema>;
export type CustomerReportFactProjection = z.output<typeof CustomerReportFactProjectionSchema>;
export type CustomerReportNarrativeFragment = z.output<typeof CustomerReportNarrativeFragmentSchema>;
export type CustomerReportSnapshot = z.output<typeof CustomerReportSnapshotSchema>;
export type ReportGeneratedEvent = z.output<typeof ReportGeneratedEventSchema>;
export type CustomerApprovedNextActionEvent = z.output<typeof CustomerApprovedNextActionEventSchema>;
export type CustomerReportDomainEvent = z.output<typeof CustomerReportDomainEventSchema>;

function reportText(maxLength: number) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .refine(hasValidUnicode, "Report text must not contain unpaired Unicode surrogates.")
    .refine(hasSupportedReportControls, "Report text must not contain unsupported control characters.");
}

function uniqueLogicalKeys(min: number, max: number, label: string) {
  return z
    .array(ReportLogicalKeySchema)
    .min(min)
    .max(max)
    .superRefine((values, context) => {
      uniqueSetOrIssue(values, label, [], context);
    });
}

function uniqueSetOrIssue(
  values: string[],
  label: string,
  path: Array<string | number>,
  context: z.RefinementCtx
): Set<string> {
  const uniqueValues = new Set<string>();

  for (const value of values) {
    if (uniqueValues.has(value)) {
      context.addIssue({ code: "custom", message: `Duplicate ${label}: ${value}.`, path });
    }
    uniqueValues.add(value);
  }

  return uniqueValues;
}

function hasValidUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) {
        return false;
      }
      index += 1;
      continue;
    }

    if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }

  return true;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function hasSupportedReportControls(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      return false;
    }
    if (codePoint < 32 && codePoint !== 9 && codePoint !== 10 && codePoint !== 13) {
      return false;
    }
    if (codePoint === 127) {
      return false;
    }
  }
  return true;
}
