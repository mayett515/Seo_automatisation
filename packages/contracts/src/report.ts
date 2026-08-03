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
export const customerReportNarrativeModes = ["fact_only", "bounded_ai"] as const;
export const customerReportLifecycleEventTypes = [
  "report_generated",
  "submitted_for_review",
  "changes_requested",
  "published",
  "superseded"
] as const;
export const customerReportArtifactStatuses = ["pending", "running", "staged", "failed", "expired"] as const;
export const customerReportArtifactFormats = ["html"] as const;
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
export const CustomerReportNarrativeModeSchema = z.enum(customerReportNarrativeModes);
export const CustomerReportLifecycleEventTypeSchema = z.enum(customerReportLifecycleEventTypes);
export const CustomerReportArtifactStatusSchema = z.enum(customerReportArtifactStatuses);
export const CustomerReportArtifactFormatSchema = z.enum(customerReportArtifactFormats);
export const CustomerReportClaimKindSchema = z.enum(customerReportClaimKinds);
export const CustomerReportSectionSchema = z.enum(customerReportSections);
export const CustomerReportEvidenceKindSchema = z.enum(customerReportEvidenceKinds);
export const CustomerReportNavigationTargetSchema = z.enum(customerReportNavigationTargets);

export const CustomerReportSha256Schema = z.string().regex(/^[0-9a-f]{64}$/u, "Expected a lowercase SHA-256 digest.");
export const CustomerReportDecisionNoteSchema = reportText(2_000);
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
  releasePlanId: ReportUuidSchema,
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
  releasePlanId: ReportUuidSchema,
  status: z.enum(["live_healthy", "live_with_warnings"]),
  checkedAt: CustomerReportTimestampSchema
}).strict();

export const ReleaseVerificationCheckReportEvidenceSchema = EvidenceBaseSchema.extend({
  sourceKind: z.literal("release_verification_check"),
  proofTier: z.literal("customer_safe_proof"),
  verificationId: ReportUuidSchema,
  releasePlanId: ReportUuidSchema,
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
  releasePlanId: ReportUuidSchema,
  status: z.literal("rolled_back"),
  rolledBackAt: CustomerReportTimestampSchema
}).strict();

export const OpportunityReportEvidenceSchema = EvidenceBaseSchema.extend({
  sourceKind: z.literal("opportunity"),
  proofTier: z.literal("supporting_context"),
  opportunityId: ReportUuidSchema,
  classification: z.literal("near_term_target"),
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
  outcome: z.literal("rolled_back_with_live_verification"),
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

export const customerReportContractLimits = {
  maxClaims: 200,
  maxEvidence: 400,
  maxNextActions: 40
} as const;

export const CustomerReportFactProjectionSchema = z
  .object({
    claims: z.array(CustomerReportClaimSchema).max(customerReportContractLimits.maxClaims),
    evidence: z.array(CustomerReportEvidenceItemSchema).max(customerReportContractLimits.maxEvidence),
    nextActions: z.array(CustomerReportNavigationRefSchema).max(customerReportContractLimits.maxNextActions)
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
    const claimsByKey = new Map(projection.claims.map((claim) => [claim.claimKey, claim] as const));
    const evidenceByKey = new Map(projection.evidence.map((evidence) => [evidence.evidenceKey, evidence] as const));

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
      const supportingClaims = action.supportingClaimKeys.flatMap((claimKey) => {
        const claim = claimsByKey.get(claimKey);
        return claim ? [claim] : [];
      });
      if (action.target.surface === "page_studio_review") {
        const pageVersionId = action.target.pageVersionId;
        if (
          !supportingClaims.some((claim) => claim.kind === "page_delivery" && claim.pageVersionId === pageVersionId)
        ) {
          context.addIssue({
            code: "custom",
            message: `Action ${action.actionKey} does not target its supporting page claim.`,
            path: ["nextActions"]
          });
        }
      }
      if (action.target.surface === "opportunity") {
        const opportunityId = action.target.opportunityId;
        if (
          !supportingClaims.some(
            (claim) => claim.kind === "future_opportunity" && claim.opportunityId === opportunityId
          )
        ) {
          context.addIssue({
            code: "custom",
            message: `Action ${action.actionKey} does not target its supporting opportunity claim.`,
            path: ["nextActions"]
          });
        }
      }
      if (action.target.surface === "release_review") {
        const releasePlanId = action.target.releasePlanId;
        const supportingEvidence = supportingClaims.flatMap((claim) =>
          claim.evidenceKeys.flatMap((evidenceKey) => {
            const evidence = evidenceByKey.get(evidenceKey);
            return evidence ? [evidence] : [];
          })
        );
        if (
          !supportingEvidence.some(
            (evidence) =>
              "releasePlanId" in evidence &&
              typeof evidence.releasePlanId === "string" &&
              evidence.releasePlanId === releasePlanId
          )
        ) {
          context.addIssue({
            code: "custom",
            message: `Action ${action.actionKey} does not target its supporting release evidence.`,
            path: ["nextActions"]
          });
        }
      }
    }
  });

export const CustomerReportEvidencePacketSchema = z
  .object({
    schemaVersion: z.literal("customer_report_evidence_packet.v1"),
    identity: CustomerReportIdentitySchema,
    assembledAt: CustomerReportTimestampSchema,
    evidenceCutoffAt: CustomerReportTimestampSchema,
    evidence: z.array(CustomerReportEvidenceItemSchema).max(customerReportContractLimits.maxEvidence)
  })
  .strict()
  .superRefine((packet, context) => {
    uniqueSetOrIssue(
      packet.evidence.map((evidence) => evidence.evidenceKey),
      "evidence key",
      ["evidence"],
      context
    );
    for (const evidence of packet.evidence) {
      if (evidence.projectId !== packet.identity.projectId) {
        context.addIssue({
          code: "custom",
          message: `Evidence ${evidence.evidenceKey} belongs to a different project.`,
          path: ["evidence"]
        });
      }
      if (evidence.selectedAtCutoff !== packet.evidenceCutoffAt) {
        context.addIssue({
          code: "custom",
          message: `Evidence ${evidence.evidenceKey} was selected at a different cutoff.`,
          path: ["evidence"]
        });
      }
    }

    if (Date.parse(packet.evidenceCutoffAt) > Date.parse(packet.assembledAt)) {
      context.addIssue({
        code: "custom",
        message: "Report evidence cutoff must not be later than packet assembly.",
        path: ["evidenceCutoffAt"]
      });
    }
  });

export const CustomerReportCompletedRollbackEvidenceSchema = z
  .object({
    status: z.literal("completed"),
    operationAttemptId: ReportUuidSchema,
    providerResultStatus: reportText(80),
    providerDeployId: reportText(200),
    sourceProviderDeployId: reportText(200),
    targetProviderDeployId: reportText(200),
    rolledBackFromProviderDeployId: reportText(200),
    executedAt: CustomerReportTimestampSchema,
    restoredProviderDeployId: reportText(200),
    liveUrl: ReportUrlSchema.nullable(),
    evidence: z.unknown().nullable()
  })
  .passthrough();

export const CreateCustomerReportGenerationRequestSchema = z
  .object({
    period: CustomerReportMonthSchema,
    evidenceCutoffAt: CustomerReportTimestampSchema,
    idempotencyKey: ReportUuidSchema,
    narrativeMode: z.literal("fact_only").default("fact_only")
  })
  .strict();

export const CustomerReportGenerationJobDataSchema = z
  .object({
    projectId: ReportUuidSchema,
    runId: ReportUuidSchema,
    maxAttempts: z.number().int().positive().max(20).optional(),
    jobRunId: ReportUuidSchema.optional(),
    triggerSource: z.enum(["user_action", "work_recovery"]).optional()
  })
  .strict();

export const CustomerReportGenerationResponseSchema = z
  .object({
    kind: z.enum(["created", "already_active", "replayed", "dry_run"]),
    reportIssueId: ReportUuidSchema.optional(),
    runId: ReportUuidSchema.optional(),
    status: z.union([CustomerReportGenerationStatusSchema, z.literal("dry_run")]),
    enqueuedByRequest: z.boolean()
  })
  .strict()
  .superRefine((response, context) => {
    const hasDurableIdentity = Boolean(response.reportIssueId && response.runId);
    if (response.kind === "dry_run" && hasDurableIdentity) {
      context.addIssue({
        code: "custom",
        message: "Dry-run report generation must not claim durable report identity.",
        path: ["kind"]
      });
    }
    if (response.kind !== "dry_run" && !hasDurableIdentity) {
      context.addIssue({
        code: "custom",
        message: "Durable report generation responses require issue and run ids.",
        path: ["runId"]
      });
    }
    if (
      (response.kind === "dry_run" && (response.status !== "dry_run" || response.enqueuedByRequest)) ||
      (response.status === "dry_run" && response.kind !== "dry_run")
    ) {
      context.addIssue({
        code: "custom",
        message: "Dry-run report generation responses must be explicit and non-enqueued.",
        path: ["status"]
      });
    }
  });

export const CustomerReportGenerationRunSchema = z
  .object({
    reportIssueId: ReportUuidSchema,
    runId: ReportUuidSchema,
    status: CustomerReportGenerationStatusSchema,
    narrativeMode: CustomerReportNarrativeModeSchema,
    evidenceCutoffAt: CustomerReportTimestampSchema,
    evidencePacketSha256: CustomerReportSha256Schema.optional(),
    resultReportId: ReportUuidSchema.optional(),
    failureCode: reportText(120).optional(),
    failureMessage: reportText(2_000).optional(),
    createdAt: CustomerReportTimestampSchema,
    startedAt: CustomerReportTimestampSchema.optional(),
    finishedAt: CustomerReportTimestampSchema.optional()
  })
  .strict();

export const CustomerReportHtmlRenderManifestSchema = z
  .object({
    schemaVersion: z.literal("customer_report_html_manifest.v1"),
    projectId: ReportUuidSchema,
    reportId: ReportUuidSchema,
    snapshotSha256: CustomerReportSha256Schema,
    reportSchemaVersion: ReportVersionTokenSchema,
    templateVersion: ReportVersionTokenSchema,
    rendererVersion: z.literal("customer_report_html_renderer.v1"),
    stylesheetVersion: z.literal("customer_report_stylesheet.v1"),
    locale: CustomerReportLocaleSchema,
    timezone: CustomerReportTimezoneSchema
  })
  .strict();

export const CustomerReportHtmlRenderJobDataSchema = z
  .object({
    projectId: ReportUuidSchema,
    reportId: ReportUuidSchema,
    artifactId: ReportUuidSchema,
    maxAttempts: z.number().int().positive().max(20).optional(),
    jobRunId: ReportUuidSchema.optional(),
    triggerSource: z.enum(["user_action", "work_recovery"]).optional()
  })
  .strict();

export const CustomerReportArtifactSummarySchema = z
  .object({
    artifactId: ReportUuidSchema,
    reportId: ReportUuidSchema,
    format: CustomerReportArtifactFormatSchema,
    status: CustomerReportArtifactStatusSchema,
    snapshotSha256: CustomerReportSha256Schema,
    manifestSha256: CustomerReportSha256Schema,
    artifactSha256: CustomerReportSha256Schema.optional(),
    byteSize: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    failureCode: reportText(120).optional(),
    failureMessage: reportText(2_000).optional(),
    createdAt: CustomerReportTimestampSchema,
    stagedAt: CustomerReportTimestampSchema.optional()
  })
  .strict();

const CustomerReportReviewTargetSchema = z
  .object({
    requestId: ReportUuidSchema,
    expectedSnapshotSha256: CustomerReportSha256Schema,
    expectedRowVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
  })
  .strict();

export const CustomerReportReviewCommandSchema = z.discriminatedUnion("command", [
  CustomerReportReviewTargetSchema.extend({ command: z.literal("submit_for_review") }).strict(),
  CustomerReportReviewTargetSchema.extend({
    command: z.literal("request_changes"),
    decisionNote: CustomerReportDecisionNoteSchema
  }).strict()
]);

export const CustomerReportReviewResponseSchema = z.discriminatedUnion("command", [
  z
    .object({
      command: z.literal("submit_for_review"),
      kind: z.enum(["applied", "replayed"]),
      reportId: ReportUuidSchema,
      status: z.literal("ready_for_review"),
      rowVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      snapshotSha256: CustomerReportSha256Schema,
      artifact: CustomerReportArtifactSummarySchema,
      renderDispatch: z.enum(["accepted", "not_required"])
    })
    .strict(),
  z
    .object({
      command: z.literal("request_changes"),
      kind: z.enum(["applied", "replayed"]),
      reportId: ReportUuidSchema,
      status: z.literal("draft"),
      rowVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      snapshotSha256: CustomerReportSha256Schema,
      renderArtifacts: z.literal("expired")
    })
    .strict()
]);

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
    narrativeMode: CustomerReportNarrativeModeSchema,
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

    if (Date.parse(snapshot.generatedAt) < Date.parse(snapshot.evidenceCutoffAt)) {
      context.addIssue({
        code: "custom",
        message: "Report generation time must not precede its evidence cutoff.",
        path: ["generatedAt"]
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
export type CustomerReportNarrativeMode = z.output<typeof CustomerReportNarrativeModeSchema>;
export type CustomerReportLifecycleEventType = z.output<typeof CustomerReportLifecycleEventTypeSchema>;
export type CustomerReportClaimKind = z.output<typeof CustomerReportClaimKindSchema>;
export type CustomerReportSection = z.output<typeof CustomerReportSectionSchema>;
export type CustomerReportEvidenceKind = z.output<typeof CustomerReportEvidenceKindSchema>;
export type CustomerReportIdentity = z.output<typeof CustomerReportIdentitySchema>;
export type CustomerReportEvidenceItem = z.output<typeof CustomerReportEvidenceItemSchema>;
export type CustomerReportClaim = z.output<typeof CustomerReportClaimSchema>;
export type CustomerReportNavigationRef = z.output<typeof CustomerReportNavigationRefSchema>;
export type CustomerReportFactProjection = z.output<typeof CustomerReportFactProjectionSchema>;
export type CustomerReportEvidencePacket = z.output<typeof CustomerReportEvidencePacketSchema>;
export type CustomerReportCompletedRollbackEvidence = z.output<typeof CustomerReportCompletedRollbackEvidenceSchema>;
export type CreateCustomerReportGenerationRequest = z.output<typeof CreateCustomerReportGenerationRequestSchema>;
export type CustomerReportGenerationJobData = z.output<typeof CustomerReportGenerationJobDataSchema>;
export type CustomerReportGenerationResponse = z.output<typeof CustomerReportGenerationResponseSchema>;
export type CustomerReportGenerationRun = z.output<typeof CustomerReportGenerationRunSchema>;
export type CustomerReportArtifactStatus = z.output<typeof CustomerReportArtifactStatusSchema>;
export type CustomerReportArtifactFormat = z.output<typeof CustomerReportArtifactFormatSchema>;
export type CustomerReportHtmlRenderManifest = z.output<typeof CustomerReportHtmlRenderManifestSchema>;
export type CustomerReportHtmlRenderJobData = z.output<typeof CustomerReportHtmlRenderJobDataSchema>;
export type CustomerReportArtifactSummary = z.output<typeof CustomerReportArtifactSummarySchema>;
export type CustomerReportReviewCommand = z.output<typeof CustomerReportReviewCommandSchema>;
export type CustomerReportReviewResponse = z.output<typeof CustomerReportReviewResponseSchema>;
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
