import {
  OpportunityResearchAgentOutputSchema,
  OpportunityResearchJobDataSchema,
  OpportunityResearchPlanStepOutputSchema,
  OpportunityResearchWorkflowInputSchema,
  OpportunityResearchWorkflowOutputSchema,
  PagePathSchema,
  buildPublicWebSearchCaptureEvidenceKey,
  opportunityResearchWorkflowVersion,
  type AgentRunEvidenceSourceKind,
  type OpportunityResearchJobData,
  type OpportunityResearchWorkflowOutput,
  type PublicWebSearchCapture
} from "@localseo/contracts";
import {
  type OpportunityResearchAgentStepDefinition,
  type OpportunityResearchExecutionBoundary,
  type OpportunityResearchToolStepDefinition,
  OpportunityResearchRuntimeError,
  opportunityResearchRuntimePublicMessage,
  opportunityResearchStepKeys,
  type OpportunityResearchPort,
  type PublicWebSearchPort
} from "@localseo/ai";
import {
  AgentLedgerConflictError,
  agentRunSteps,
  appendAgentRunEvent,
  bindAgentRunEvidenceSource,
  canonicalAgentLedgerSha256,
  canonicalAgentLedgerText,
  claimAgentRunStep,
  claimOpportunityResearchExecution,
  completeAgentRunStep,
  failAgentRunStep,
  failOpportunityResearchExecution,
  loadOpportunityResearchMaterial,
  OpportunityResearchPersistenceConflictError,
  persistOpportunityResearchSuccess,
  publicWebSearchCaptures,
  renewOpportunityResearchExecutionHeartbeat,
  type DatabaseClient,
  type OpportunityResearchMaterial,
  type OpportunityResearchMaterialSource,
  type PersistedOpportunityResearchCandidate
} from "@localseo/db";
import {
  deriveOpportunityLane,
  normalizeOpportunityResearchKey,
  opportunityEvidenceReadinessForSources,
  opportunityRankingMilestoneForRank
} from "@localseo/domain";
import { and, eq } from "@localseo/db/query";
import type { Job } from "bullmq";

type DbHandle = { db: DatabaseClient } | undefined;

export class OpportunityResearchConfigurationError extends Error {}
export class OpportunityResearchEvidenceError extends Error {}
export class OpportunityResearchQaError extends Error {}
export class OpportunityResearchInProgressError extends Error {}

export function parseOpportunityResearchJobData(
  job: Pick<Job, "data" | "name" | "queueName">
): OpportunityResearchJobData {
  if (job.queueName !== "opportunity-research" || job.name !== "opportunity_research") {
    throw new OpportunityResearchEvidenceError("Opportunity Research job identity is invalid.");
  }
  const parsed = OpportunityResearchJobDataSchema.safeParse(job.data);
  if (!parsed.success) throw new OpportunityResearchEvidenceError("Opportunity Research job data is invalid.");
  return parsed.data;
}

export async function handleOpportunityResearchJob(
  job: Job,
  dbHandle: DbHandle,
  port: OpportunityResearchPort,
  options: { heartbeatIntervalMs?: number } = {}
): Promise<Record<string, unknown>> {
  if (!dbHandle) throw new OpportunityResearchConfigurationError("Opportunity Research requires DATABASE_URL.");
  const data = parseOpportunityResearchJobData(job);
  let executionEpoch: number | undefined;
  try {
    const executionClaimToken = `${data.jobRunId}:attempt-${job.attemptsMade + 1}`;
    const executionClaim = await claimOpportunityResearchExecution(dbHandle.db, {
      ...data,
      executionClaimToken
    });
    if (executionClaim.kind === "already_running") {
      throw new OpportunityResearchInProgressError("Opportunity Research is already owned by another worker delivery.");
    }
    if (executionClaim.kind === "already_succeeded") {
      OpportunityResearchWorkflowOutputSchema.parse(executionClaim.outputJson);
      return {
        status: "succeeded",
        replayed: true,
        runId: data.runId,
        materialDigest: data.materialDigest,
        outputSha256: executionClaim.outputSha256
      };
    }
    const claimedExecutionEpoch = executionClaim.executionEpoch;
    executionEpoch = claimedExecutionEpoch;
    return await withOpportunityResearchHeartbeat({
      intervalMs: options.heartbeatIntervalMs ?? 60_000,
      renew: () =>
        renewOpportunityResearchExecutionHeartbeat(dbHandle.db, {
          projectId: data.projectId,
          runId: data.runId,
          expectedExecutionEpoch: executionClaim.executionEpoch,
          expectedExecutionClaimToken: executionClaimToken,
          expectedExecutionRecoveryCount: executionClaim.executionRecoveryCount
        }),
      execute: async (signal) => {
        const material = await loadOpportunityResearchMaterial(dbHandle.db, data.projectId);
        assertCurrentMaterial(material, data.materialDigest);
        const boundary = new LedgerOpportunityResearchBoundary(dbHandle.db, data, material, claimedExecutionEpoch);
        const output = await port.run(
          OpportunityResearchWorkflowInputSchema.parse({
            projectId: data.projectId,
            runId: data.runId,
            materialDigest: data.materialDigest,
            maxCandidates: 20,
            initialQueries: material.initialQueries,
            requestedLocale: "de-DE",
            evidencePacket: material.evidencePacket
          }),
          boundary,
          signal
        );
        const finalized = finalizeOpportunityResearchOutput(material, output, data);
        const persisted = await persistOpportunityResearchSuccess(dbHandle.db, {
          projectId: data.projectId,
          runId: data.runId,
          materialDigest: data.materialDigest,
          output,
          candidates: finalized.candidates,
          provider: boundary.provider ?? "mastra",
          model: boundary.model ?? "unknown",
          expectedExecutionEpoch: claimedExecutionEpoch,
          occurredAt: new Date()
        });
        return {
          status: "succeeded",
          runId: data.runId,
          materialDigest: data.materialDigest,
          outputSha256: persisted.outputSha256,
          opportunityCount: persisted.opportunityCount,
          portfolioShortfalls: persisted.shortfalls
        };
      }
    });
  } catch (error) {
    const normalized = normalizeOpportunityResearchFailure(error);
    if (
      executionEpoch !== undefined &&
      !(error instanceof OpportunityResearchInProgressError) &&
      (normalized.terminal || isFinalAttempt(job))
    ) {
      await failOpportunityResearchExecution(dbHandle.db, {
        projectId: data.projectId,
        runId: data.runId,
        failureCode: normalized.code,
        failureMessage: normalized.error.message,
        needsResearch: normalized.needsResearch,
        suppressAutomaticRetry: normalized.code === "model_egress_blocked",
        expectedExecutionEpoch: executionEpoch
      });
    }
    throw normalized.error;
  }
}

export function createOpportunityResearchProviderAttemptGuard(db: DatabaseClient) {
  return async (identity: { projectId: string; runId: string; materialDigest: string }): Promise<void> => {
    const material = await loadOpportunityResearchMaterial(db, identity.projectId);
    assertCurrentMaterial(material, identity.materialDigest);
  };
}

async function withOpportunityResearchHeartbeat<T>(input: {
  intervalMs: number;
  renew: () => Promise<boolean>;
  execute: (signal: AbortSignal) => Promise<T>;
}): Promise<T> {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  let rejectLease: (error: Error) => void = () => undefined;
  const leaseLost = new Promise<never>((_resolve, reject) => {
    rejectLease = reject;
  });
  const schedule = () => {
    timer = setTimeout(() => {
      void (async () => {
        try {
          if (!(await input.renew())) {
            throw new OpportunityResearchInProgressError(
              "Opportunity Research execution lease is no longer owned by this worker delivery."
            );
          }
        } catch {
          if (!stopped) {
            const error = new OpportunityResearchInProgressError(
              "Opportunity Research execution lease could not be renewed by this worker delivery."
            );
            controller.abort(error);
            rejectLease(error);
          }
          return;
        }
        if (!stopped) schedule();
      })();
    }, input.intervalMs);
  };
  schedule();
  try {
    return await Promise.race([input.execute(controller.signal), leaseLost]);
  } finally {
    stopped = true;
    if (timer) clearTimeout(timer);
  }
}

class LedgerOpportunityResearchBoundary implements OpportunityResearchExecutionBoundary {
  provider?: string;
  model?: string;
  private readonly activeStepIds = new Map<string, string>();

  constructor(
    private readonly db: DatabaseClient,
    private readonly data: OpportunityResearchJobData,
    private readonly material: OpportunityResearchMaterial,
    private readonly executionEpoch: number
  ) {}

  async executeAgentStep<T>(definition: OpportunityResearchAgentStepDefinition<T>): Promise<T> {
    const claim = await claimAgentRunStep(this.db, {
      projectId: this.data.projectId,
      runId: this.data.runId,
      stepKey: definition.stepKey,
      stepKind: "agent",
      agentRole: definition.agentRole,
      eventKey: `step.started.e${this.executionEpoch}.${definition.stepKey}`,
      maxAttempts: 3,
      expectedExecutionEpoch: this.executionEpoch
    });
    if (claim.kind === "already_succeeded") {
      const [stored] = await this.db
        .select({
          outputJson: agentRunSteps.outputJson,
          outputSha256: agentRunSteps.outputSha256,
          outputCanonicalText: agentRunSteps.outputCanonicalText,
          provider: agentRunSteps.provider,
          model: agentRunSteps.model
        })
        .from(agentRunSteps)
        .where(
          and(
            eq(agentRunSteps.id, claim.stepId),
            eq(agentRunSteps.agentRunId, this.data.runId),
            eq(agentRunSteps.projectId, this.data.projectId)
          )
        )
        .limit(1);
      if (
        !stored?.outputJson ||
        !stored.outputSha256 ||
        canonicalAgentLedgerSha256(stored.outputJson) !== stored.outputSha256 ||
        canonicalAgentLedgerText(stored.outputJson) !== stored.outputCanonicalText
      )
        throw new OpportunityResearchEvidenceError("Succeeded workflow step has no replay output.");
      this.provider = stored.provider ?? this.provider;
      this.model = stored.model ?? this.model;
      return definition.parseOutput(stored.outputJson);
    }

    this.activeStepIds.set(definition.stepKey, claim.stepId);
    try {
      if (definition.stepKey === opportunityResearchStepKeys.researchPlan) {
        await this.bindMaterialInputs(claim.stepId);
      }
      const result = await definition.execute();
      const parsedOutput = definition.parseOutput(result.output);
      const evidenceLinks = await this.outputCitationLinks(definition.stepKey, parsedOutput);
      await completeAgentRunStep(this.db, {
        projectId: this.data.projectId,
        runId: this.data.runId,
        stepId: claim.stepId,
        expectedRowVersion: claim.rowVersion,
        outputJson: asRecord(parsedOutput),
        usageJson: result.usage ? { ...result.usage } : undefined,
        provider: result.provider,
        model: result.model,
        evidenceLinks,
        expectedExecutionEpoch: this.executionEpoch,
        eventKey: `step.succeeded.e${this.executionEpoch}.${definition.stepKey}`
      });
      this.provider = result.provider;
      this.model = result.model;
      return parsedOutput;
    } catch (error) {
      try {
        await failAgentRunStep(this.db, {
          projectId: this.data.projectId,
          runId: this.data.runId,
          stepId: claim.stepId,
          expectedRowVersion: claim.rowVersion,
          failureCode: stepFailureCode(error),
          failureMessage: errorMessage(error),
          expectedExecutionEpoch: this.executionEpoch,
          eventKey: `step.failed.e${this.executionEpoch}.${definition.stepKey}.${claim.attemptCount}`
        });
      } catch (failureError) {
        if (!(failureError instanceof AgentLedgerConflictError)) throw failureError;
      }
      throw error;
    } finally {
      this.activeStepIds.delete(definition.stepKey);
    }
  }

  async executeToolStep<T>(definition: OpportunityResearchToolStepDefinition<T>): Promise<T> {
    const claim = await claimAgentRunStep(this.db, {
      projectId: this.data.projectId,
      runId: this.data.runId,
      stepKey: definition.stepKey,
      stepKind: "tool",
      toolKey: definition.toolKey,
      eventKey: `step.started.e${this.executionEpoch}.${definition.stepKey}`,
      maxAttempts: 3,
      expectedExecutionEpoch: this.executionEpoch
    });
    if (claim.kind === "already_succeeded") {
      const [stored] = await this.db
        .select({
          outputJson: agentRunSteps.outputJson,
          outputSha256: agentRunSteps.outputSha256,
          outputCanonicalText: agentRunSteps.outputCanonicalText
        })
        .from(agentRunSteps)
        .where(
          and(
            eq(agentRunSteps.id, claim.stepId),
            eq(agentRunSteps.agentRunId, this.data.runId),
            eq(agentRunSteps.projectId, this.data.projectId)
          )
        )
        .limit(1);
      if (
        !stored?.outputJson ||
        !stored.outputSha256 ||
        canonicalAgentLedgerSha256(stored.outputJson) !== stored.outputSha256 ||
        canonicalAgentLedgerText(stored.outputJson) !== stored.outputCanonicalText
      ) {
        throw new OpportunityResearchEvidenceError("Succeeded tool step has invalid replay output evidence.");
      }
      return definition.parseOutput(stored.outputJson);
    }

    this.activeStepIds.set(definition.stepKey, claim.stepId);
    try {
      const parsedOutput = definition.parseOutput(await definition.execute());
      await completeAgentRunStep(this.db, {
        projectId: this.data.projectId,
        runId: this.data.runId,
        stepId: claim.stepId,
        expectedRowVersion: claim.rowVersion,
        expectedExecutionEpoch: this.executionEpoch,
        outputJson: asRecord(parsedOutput),
        eventKey: `step.succeeded.e${this.executionEpoch}.${definition.stepKey}`
      });
      return parsedOutput;
    } catch (error) {
      try {
        await failAgentRunStep(this.db, {
          projectId: this.data.projectId,
          runId: this.data.runId,
          stepId: claim.stepId,
          expectedRowVersion: claim.rowVersion,
          expectedExecutionEpoch: this.executionEpoch,
          failureCode: stepFailureCode(error),
          failureMessage: errorMessage(error),
          eventKey: `step.failed.e${this.executionEpoch}.${definition.stepKey}.${claim.attemptCount}`
        });
      } catch (failureError) {
        if (!(failureError instanceof AgentLedgerConflictError)) throw failureError;
      }
      throw error;
    } finally {
      this.activeStepIds.delete(definition.stepKey);
    }
  }

  async executePublicWebSearch(input: {
    parentStepKey: typeof opportunityResearchStepKeys.researchPlan | typeof opportunityResearchStepKeys.followUpCapture;
    request: Omit<Parameters<PublicWebSearchPort["search"]>[0], "executionEpoch">;
    execute: (request: Parameters<PublicWebSearchPort["search"]>[0]) => Promise<PublicWebSearchCapture>;
  }): Promise<PublicWebSearchCapture> {
    const stepId = this.activeStepIds.get(input.parentStepKey);
    if (!stepId) throw new OpportunityResearchEvidenceError("Public web search has no active research step.");
    const keyPrefix = `tool.public-web-search.e${this.executionEpoch}.${input.request.researchOrdinal}`;
    await appendAgentRunEvent(this.db, {
      projectId: this.data.projectId,
      runId: this.data.runId,
      stepId,
      eventKey: `${keyPrefix}.requested`,
      eventType: "tool.call.requested",
      expectedExecutionEpoch: this.executionEpoch,
      payload: { query: input.request.query, round: input.request.round }
    });
    await appendAgentRunEvent(this.db, {
      projectId: this.data.projectId,
      runId: this.data.runId,
      stepId,
      eventKey: `${keyPrefix}.allowed`,
      eventType: "tool.call.allowed",
      expectedExecutionEpoch: this.executionEpoch,
      payload: { toolKey: "public_web_search", policy: "research_support_only" }
    });
    const capture = await input.execute({ ...input.request, executionEpoch: this.executionEpoch });
    if (capture.status === "succeeded") {
      await bindAgentRunEvidenceSource(this.db, {
        projectId: this.data.projectId,
        runId: this.data.runId,
        stepId,
        role: "captured",
        ordinal: input.request.researchOrdinal - 1,
        evidence: {
          evidenceKey: capture.evidenceKey,
          sourceKind: "public_web_search_capture",
          sourceId: capture.id,
          sourceVersion: `captured-at:${capture.capturedAt}`
        },
        expectedExecutionEpoch: this.executionEpoch,
        eventKey: `${keyPrefix}.evidence-bound`
      });
      await appendAgentRunEvent(this.db, {
        projectId: this.data.projectId,
        runId: this.data.runId,
        stepId,
        eventKey: `${keyPrefix}.captured`,
        eventType: "tool.result.captured",
        expectedExecutionEpoch: this.executionEpoch,
        payload: { captureId: capture.id, resultCount: capture.results.length }
      });
    } else {
      await appendAgentRunEvent(this.db, {
        projectId: this.data.projectId,
        runId: this.data.runId,
        stepId,
        eventKey: `${keyPrefix}.failed`,
        eventType: "tool.call.failed",
        expectedExecutionEpoch: this.executionEpoch,
        payload: { captureId: capture.id, failureCode: capture.failureCode }
      });
    }
    return capture;
  }

  private async bindMaterialInputs(stepId: string): Promise<void> {
    for (const [ordinal, source] of this.material.evidenceSources.entries()) {
      await this.bindEvidence(stepId, source, "input", ordinal, `evidence.input.e${this.executionEpoch}.${ordinal}`);
    }
  }

  private async outputCitationLinks(stepKey: string, value: unknown) {
    const citations =
      stepKey === opportunityResearchStepKeys.researchPlan
        ? OpportunityResearchPlanStepOutputSchema.parse(value).research.findings.flatMap(
            (finding) => finding.evidenceKeys
          )
        : OpportunityResearchWorkflowOutputSchema.parse(value).candidates.flatMap(
            (candidate) => candidate.evidenceKeys
          );
    const unique = [...new Set(citations)].sort();
    const known = await this.knownEvidenceSources();
    return unique.map((evidenceKey, ordinal) => {
      const source = known.get(evidenceKey);
      if (!source) throw new OpportunityResearchQaError(`Model cited unknown evidence key: ${evidenceKey}.`);
      return {
        role: "cited" as const,
        ordinal,
        evidence: source,
        eventKey: `evidence.cited.e${this.executionEpoch}.${stepKey}.${ordinal}`
      };
    });
  }

  private async knownEvidenceSources(): Promise<Map<string, OpportunityResearchMaterialSource>> {
    const known = new Map(this.material.evidenceSources.map((source) => [source.evidenceKey, source]));
    const captureRows = await this.db
      .select({ id: publicWebSearchCaptures.id, capturedAt: publicWebSearchCaptures.capturedAt })
      .from(publicWebSearchCaptures)
      .where(
        and(
          eq(publicWebSearchCaptures.agentRunId, this.data.runId),
          eq(publicWebSearchCaptures.projectId, this.data.projectId),
          eq(publicWebSearchCaptures.status, "succeeded")
        )
      );
    for (const row of captureRows) {
      const evidenceKey = buildPublicWebSearchCaptureEvidenceKey(row.id);
      known.set(evidenceKey, {
        evidenceKey,
        sourceKind: "public_web_search_capture",
        sourceId: row.id,
        sourceVersion: `captured-at:${row.capturedAt.toISOString()}`
      });
    }
    return known;
  }

  private async bindEvidence(
    stepId: string,
    source: Pick<OpportunityResearchMaterialSource, "evidenceKey" | "sourceKind" | "sourceId" | "sourceVersion">,
    role: "input" | "cited",
    ordinal: number,
    eventKey: string
  ): Promise<void> {
    try {
      await bindAgentRunEvidenceSource(this.db, {
        projectId: this.data.projectId,
        runId: this.data.runId,
        stepId,
        role,
        ordinal,
        evidence: source,
        expectedExecutionEpoch: this.executionEpoch,
        eventKey
      });
    } catch (error) {
      throw new OpportunityResearchEvidenceError(
        `Evidence binding failed for ${source.evidenceKey}: ${errorMessage(error)}`
      );
    }
  }
}

export function finalizeOpportunityResearchOutput(
  material: OpportunityResearchMaterial,
  value: OpportunityResearchWorkflowOutput,
  data: OpportunityResearchJobData
): {
  candidates: PersistedOpportunityResearchCandidate[];
} {
  const output = OpportunityResearchWorkflowOutputSchema.parse(value);
  const packet = asRecord(material.evidencePacket);
  const services = entityMap(packet.services, "service");
  const areas = entityMap(packet.areas, "area");
  const proofs = rankingProofMap(packet.rankingProofs);
  const existingRoutes = new Set(stringArray(packet.existingRoutes).map(normalizeRoute));
  const sourceKinds = new Map<string, AgentRunEvidenceSourceKind>(
    material.evidenceSources.map((source) => [source.evidenceKey, source.sourceKind])
  );
  for (const capture of output.captures) {
    if (capture.status === "succeeded") {
      sourceKinds.set(capture.evidenceKey, "public_web_search_capture");
    }
  }
  for (const finding of OpportunityResearchAgentOutputSchema.parse(output.research).findings) {
    assertEvidenceKeys(finding.evidenceKeys, sourceKinds);
  }

  const candidates = output.candidates.map((candidate) => {
    const service = services.get(candidate.serviceId);
    const area = areas.get(candidate.areaId);
    if (!service || service.name !== candidate.service) {
      throw new OpportunityResearchQaError(
        `Candidate service ${candidate.serviceId} is not an exact confirmed service.`
      );
    }
    if (!area || area.name !== candidate.area) {
      throw new OpportunityResearchQaError(`Candidate area ${candidate.areaId} is not an exact confirmed area.`);
    }
    if (candidate.suggestedRoute && !PagePathSchema.safeParse(candidate.suggestedRoute).success) {
      throw new OpportunityResearchQaError("Candidate suggested route is invalid.");
    }
    if (candidate.suggestedRoute && existingRoutes.has(normalizeRoute(candidate.suggestedRoute))) {
      throw new OpportunityResearchQaError(`Candidate suggested route ${candidate.suggestedRoute} already exists.`);
    }
    assertEvidenceKeys(candidate.evidenceKeys, sourceKinds);
    const citedProofs = candidate.evidenceKeys
      .filter((key) => sourceKinds.get(key) === "ranking_proof")
      .map((key) => proofs.get(key))
      .filter((proof): proof is { query: string; rank: number } => Boolean(proof))
      .filter((proof) => normalizeText(proof.query) === normalizeText(candidate.primaryKeyword));
    const bestRank = citedProofs.length > 0 ? Math.min(...citedProofs.map((proof) => proof.rank)) : undefined;
    const evidenceReadiness = opportunityEvidenceReadinessForSources({
      hasReviewedRankingProof: bestRank !== undefined,
      hasSupportingContext: candidate.evidenceKeys.some((key) => isSupportingSource(sourceKinds.get(key)))
    });
    const axesWithoutLane = {
      rankingMilestone: opportunityRankingMilestoneForRank(bestRank),
      evidenceReadiness,
      businessValue: candidate.businessValue,
      marketDifficulty: candidate.marketDifficulty,
      executionEffort: candidate.executionEffort
    };
    const lane = deriveOpportunityLane(axesWithoutLane);
    const candidateKey = normalizeOpportunityResearchKey(candidate);
    const id = opportunityResearchCandidateId({ runId: data.runId, candidateKey, candidate });
    return {
      id,
      projectId: data.projectId,
      agentRunId: data.runId,
      areaId: candidate.areaId,
      serviceId: candidate.serviceId,
      primaryKeyword: candidate.primaryKeyword,
      ...axesWithoutLane,
      lane,
      policyVersion: "opportunity-portfolio.v1",
      researchMaterialDigest: data.materialDigest,
      candidateKey,
      evidenceJson: {
        workflowVersion: opportunityResearchWorkflowVersion,
        candidate,
        derivedAxes: { ...axesWithoutLane, lane },
        citedEvidenceKeys: [...new Set(candidate.evidenceKeys)].sort()
      }
    } satisfies PersistedOpportunityResearchCandidate;
  });
  return { candidates };
}

export function opportunityResearchCandidateId(input: {
  runId: string;
  candidateKey: string;
  candidate: unknown;
}): string {
  const digest = canonicalAgentLedgerSha256(input);
  const variant = ((Number.parseInt(digest[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const uuidHex = `${digest.slice(0, 12)}8${digest.slice(13, 16)}${variant}${digest.slice(17, 32)}`;
  return `${uuidHex.slice(0, 8)}-${uuidHex.slice(8, 12)}-${uuidHex.slice(12, 16)}-${uuidHex.slice(16, 20)}-${uuidHex.slice(20)}`;
}

function assertCurrentMaterial(material: OpportunityResearchMaterial, expectedDigest: string): void {
  if (material.materialDigest !== expectedDigest || material.readinessIssues.length > 0) {
    throw new OpportunityResearchEvidenceError(
      `Opportunity Research material changed or became ineligible: ${material.readinessIssues.join(", ") || "digest_mismatch"}.`
    );
  }
}

function assertEvidenceKeys(
  evidenceKeys: readonly string[],
  sourceKinds: ReadonlyMap<string, AgentRunEvidenceSourceKind>
): void {
  if (new Set(evidenceKeys).size !== evidenceKeys.length) {
    throw new OpportunityResearchQaError("Evidence citations must be unique.");
  }
  for (const key of evidenceKeys) {
    if (!sourceKinds.has(key)) throw new OpportunityResearchQaError(`Unknown evidence citation: ${key}.`);
  }
}

function entityMap(value: unknown, label: string): Map<string, { name: string }> {
  if (!Array.isArray(value)) throw new OpportunityResearchEvidenceError(`Material packet has no ${label} list.`);
  const result = new Map<string, { name: string }>();
  for (const item of value) {
    const record = asRecord(item);
    if (typeof record.id !== "string" || typeof record.name !== "string") {
      throw new OpportunityResearchEvidenceError(`Material packet has an invalid ${label}.`);
    }
    result.set(record.id, { name: record.name });
  }
  return result;
}

function rankingProofMap(value: unknown): Map<string, { query: string; rank: number }> {
  const result = new Map<string, { query: string; rank: number }>();
  if (!Array.isArray(value)) return result;
  for (const item of value) {
    const record = asRecord(item);
    if (typeof record.id === "string" && typeof record.query === "string" && typeof record.rank === "number") {
      result.set(`ranking_proof:${record.id}`, { query: record.query, rank: record.rank });
    }
  }
  return result;
}

function isSupportingSource(kind: AgentRunEvidenceSourceKind | undefined): boolean {
  return kind !== undefined && !["gsc_row", "gsc_signal"].includes(kind);
}

function normalizeOpportunityResearchFailure(error: unknown): {
  error: Error;
  code: string;
  terminal: boolean;
  needsResearch: boolean;
} {
  if (error instanceof OpportunityResearchConfigurationError) {
    return { error, code: "configuration_error", terminal: true, needsResearch: false };
  }
  if (error instanceof OpportunityResearchInProgressError) {
    return { error, code: "workflow_in_progress", terminal: false, needsResearch: false };
  }
  if (error instanceof OpportunityResearchEvidenceError) {
    return { error, code: "material_or_evidence_invalid", terminal: true, needsResearch: true };
  }
  if (error instanceof OpportunityResearchQaError) {
    return { error, code: "qa_rejected", terminal: true, needsResearch: false };
  }
  if (error instanceof OpportunityResearchPersistenceConflictError) {
    const needsResearch = error.message.includes("material changed");
    return {
      error: new OpportunityResearchEvidenceError(error.message),
      code: needsResearch ? "material_stale" : "lifecycle_conflict",
      terminal: true,
      needsResearch
    };
  }
  if (error instanceof OpportunityResearchRuntimeError && error.code === "provider_not_configured") {
    return {
      error: new OpportunityResearchConfigurationError(opportunityResearchRuntimePublicMessage(error.code)),
      code: error.code,
      terminal: true,
      needsResearch: false
    };
  }
  if (error instanceof OpportunityResearchRuntimeError && error.code === "model_egress_blocked") {
    return {
      error: new OpportunityResearchEvidenceError(opportunityResearchRuntimePublicMessage(error.code)),
      code: error.code,
      terminal: true,
      needsResearch: false
    };
  }
  const runtimeError =
    error instanceof OpportunityResearchRuntimeError
      ? new OpportunityResearchRuntimeError(opportunityResearchRuntimePublicMessage(error.code), error.code)
      : error instanceof Error
        ? error
        : new Error("Unknown Opportunity Research failure.");
  return {
    error: runtimeError,
    code: error instanceof OpportunityResearchRuntimeError ? error.code : "workflow_execution_failed",
    terminal: false,
    needsResearch: false
  };
}

function stepFailureCode(error: unknown): string {
  if (error instanceof OpportunityResearchRuntimeError) return error.code;
  if (error instanceof OpportunityResearchQaError) return "qa_rejected";
  if (error instanceof OpportunityResearchEvidenceError) return "evidence_invalid";
  return "step_execution_failed";
}

function errorMessage(error: unknown): string {
  if (error instanceof OpportunityResearchRuntimeError) {
    return opportunityResearchRuntimePublicMessage(error.code);
  }
  return (error instanceof Error ? error.message : "Unknown Opportunity Research step failure.").slice(0, 1_000);
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, " ");
}

function normalizeRoute(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 1 && normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OpportunityResearchEvidenceError("Expected a record value.");
  }
  return value as Record<string, unknown>;
}

function isFinalAttempt(job: Pick<Job, "attemptsMade" | "opts">): boolean {
  return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
}
