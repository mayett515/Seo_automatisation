import type { AiReasoningPort, AiReasoningRunResult, AiReasoningUsage, ObjectStoragePort } from "@localseo/adapters";
import {
  OpportunityScoutJobDataSchema,
  OpportunityScoutOutputSchema,
  type AiReasoningAdapterFailureCode,
  type AiReasoningWorkflowFailureCode,
  type OpportunityScoutJobData
} from "@localseo/contracts";
import {
  buildOpportunityScoutEvidencePacket,
  buildOpportunityScoutPrompt,
  evaluateOpportunityScoutOutput,
  type EvaluatedOpportunityScoutOutput,
  type OpportunityScoutEvidencePacket,
  type ResolvableEvidenceRef
} from "@localseo/ai";
import {
  agentRuns,
  gscOpportunitySignals,
  gscSearchAnalyticsRows,
  opportunities,
  pageProposals,
  trackingEvents,
  websiteImportRuns
} from "@localseo/db";
import type { Job } from "bullmq";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { WorkerDb, WorkerDbHandle } from "../job-run.js";

type AgentRunRow = typeof agentRuns.$inferSelect;

export type OpportunityScoutEvidence = {
  packet: OpportunityScoutEvidencePacket;
  resolvableEvidence: ResolvableEvidenceRef[];
  existingRoutes: string[];
  existingOpportunityKeys: string[];
};

export type OpportunityScoutRepository = {
  loadRun(data: OpportunityScoutJobData): Promise<AgentRunRow | undefined>;
  markRunning(data: OpportunityScoutJobData): Promise<boolean>;
  recordInputRef(input: { data: OpportunityScoutJobData; inputRef: string }): Promise<void>;
  loadEvidence(data: OpportunityScoutJobData): Promise<OpportunityScoutEvidence>;
  persistSuccess(input: {
    data: OpportunityScoutJobData;
    inputRef: string;
    output: EvaluatedOpportunityScoutOutput;
    provider: string;
    model: string;
    usage?: AiReasoningUsage;
    diagnostics: Record<string, unknown>;
    latencyMs?: number;
  }): Promise<{ opportunityCount: number }>;
  markFailed(input: {
    data: OpportunityScoutJobData;
    failureCode: AiReasoningAdapterFailureCode | AiReasoningWorkflowFailureCode;
    provider?: string;
    model?: string;
    outputJson?: Record<string, unknown>;
    usage?: AiReasoningUsage;
    diagnostics: Record<string, unknown>;
    latencyMs?: number;
  }): Promise<void>;
};

export class OpportunityScoutConfigurationError extends Error {}
export class OpportunityScoutEvidenceError extends Error {}
export class OpportunityScoutProviderError extends Error {}
export class OpportunityScoutWorkflowError extends Error {}

export async function handleOpportunityScoutJob(
  job: Job,
  dbHandle: WorkerDbHandle | undefined,
  reasoning: AiReasoningPort,
  objectStorage: ObjectStoragePort,
  options: { reasoningTimeoutMs?: number } = {}
): Promise<Record<string, unknown>> {
  const data = parseOpportunityScoutJobData(job.data);

  if (!dbHandle) {
    throw new OpportunityScoutConfigurationError("DATABASE_URL is required for opportunity scout jobs");
  }

  return executeOpportunityScout({
    data,
    repository: createDrizzleOpportunityScoutRepository(dbHandle.db),
    reasoning,
    objectStorage,
    reasoningTimeoutMs: options.reasoningTimeoutMs
  });
}

export async function executeOpportunityScout(input: {
  data: OpportunityScoutJobData;
  repository: OpportunityScoutRepository;
  reasoning: AiReasoningPort;
  objectStorage: ObjectStoragePort;
  reasoningTimeoutMs?: number;
}): Promise<Record<string, unknown>> {
  const run = await input.repository.loadRun(input.data);

  if (!run) {
    throw new OpportunityScoutEvidenceError(`Opportunity scout run ${input.data.runId} was not found.`);
  }

  if (run.task !== "opportunity_scout") {
    throw new OpportunityScoutEvidenceError(`Agent run ${input.data.runId} is not an opportunity_scout run.`);
  }

  if (run.status === "succeeded") {
    return {
      status: "already_succeeded",
      runId: input.data.runId
    };
  }

  if (run.status !== "running") {
    const markedRunning = await input.repository.markRunning(input.data);
    if (!markedRunning) {
      const latest = await input.repository.loadRun(input.data);
      if (latest?.status === "succeeded") {
        return {
          status: "already_succeeded",
          runId: input.data.runId
        };
      }
      throw new OpportunityScoutEvidenceError(`Agent run ${input.data.runId} could not be marked running.`);
    }
  }

  const evidence = await input.repository.loadEvidence(input.data);
  const inputRef = await storeEvidencePacket(input.objectStorage, input.data, evidence.packet);
  await input.repository.recordInputRef({ data: input.data, inputRef });

  const reasoningResult = await input.reasoning.runStructured({
    task: "opportunity_scout",
    projectId: input.data.projectId,
    runId: input.data.runId,
    prompt: buildOpportunityScoutPrompt(),
    inputJson: evidence.packet,
    outputSchemaName: "OpportunityScoutOutput",
    timeoutMs: input.reasoningTimeoutMs ?? 120_000,
    policy: {
      canMutateProduction: false,
      allowedToolCategories: ["read_evidence", "analyze"]
    }
  });

  if (!reasoningResult.ok) {
    await input.repository.markFailed({
      data: input.data,
      failureCode: reasoningResult.failureCode,
      provider: reasoningResult.provider,
      model: reasoningResult.model,
      diagnostics: compactDiagnostics(reasoningResult.diagnostics),
      latencyMs: reasoningResult.diagnostics.latencyMs
    });
    throw new OpportunityScoutProviderError(reasoningResult.failureCode);
  }

  const parsedOutput = OpportunityScoutOutputSchema.safeParse(reasoningResult.outputJson);
  if (!parsedOutput.success) {
    await markWorkflowFailure(input.repository, input.data, reasoningResult, {
      failureCode: "output_schema_mismatch",
      diagnostics: {
        message: "Opportunity scout output did not match OpportunityScoutOutputSchema.",
        issues: parsedOutput.error.issues.slice(0, 10)
      },
      outputJson: compactOutputJson(reasoningResult.outputJson)
    });
    throw new OpportunityScoutWorkflowError("output_schema_mismatch");
  }

  const qaResult = evaluateOpportunityScoutOutput({
    projectId: input.data.projectId,
    output: parsedOutput.data,
    resolvableEvidence: evidence.resolvableEvidence,
    existingRoutes: evidence.existingRoutes,
    existingOpportunityKeys: evidence.existingOpportunityKeys,
    maxBriefs: input.data.maxBriefs
  });

  if (!qaResult.ok) {
    await markWorkflowFailure(input.repository, input.data, reasoningResult, {
      failureCode: "qa_rejected",
      diagnostics: qaResult.failure,
      outputJson: compactOutputJson(parsedOutput.data)
    });
    throw new OpportunityScoutWorkflowError(`qa_rejected:${qaResult.failure.gateId}`);
  }

  const persisted = await input.repository.persistSuccess({
    data: input.data,
    inputRef,
    output: qaResult.output,
    provider: reasoningResult.provider,
    model: reasoningResult.model,
    usage: reasoningResult.usage,
    diagnostics: compactDiagnostics(reasoningResult.diagnostics),
    latencyMs: reasoningResult.diagnostics.latencyMs
  });

  return {
    status: "succeeded",
    runId: input.data.runId,
    inputRef,
    opportunityCount: persisted.opportunityCount
  };
}

export function parseOpportunityScoutJobData(data: unknown): OpportunityScoutJobData {
  const parsed = OpportunityScoutJobDataSchema.safeParse(data);

  if (!parsed.success) {
    throw new OpportunityScoutEvidenceError("Opportunity scout jobs require projectId and runId.");
  }

  return parsed.data;
}

export function createDrizzleOpportunityScoutRepository(db: WorkerDb): OpportunityScoutRepository {
  return {
    async loadRun(data) {
      const [run] = await db
        .select()
        .from(agentRuns)
        .where(and(eq(agentRuns.id, data.runId), eq(agentRuns.projectId, data.projectId)))
        .limit(1);

      return run;
    },

    async markRunning(data) {
      const updated = await db
        .update(agentRuns)
        .set({
          status: "running",
          failureCode: null,
          provider: null,
          model: null,
          outputJson: null,
          usageJson: null,
          latencyMs: null,
          startedAt: new Date(),
          completedAt: null,
          diagnosticsJson: null,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(agentRuns.id, data.runId),
            eq(agentRuns.projectId, data.projectId),
            inArray(agentRuns.status, ["queued", "failed"])
          )
        )
        .returning({ id: agentRuns.id });

      return updated.length > 0;
    },

    async recordInputRef(input) {
      await db
        .update(agentRuns)
        .set({
          inputRef: input.inputRef,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(agentRuns.id, input.data.runId),
            eq(agentRuns.projectId, input.data.projectId),
            ne(agentRuns.status, "succeeded")
          )
        );
    },

    async loadEvidence(data) {
      return loadOpportunityScoutEvidence(db, data.projectId);
    },

    async persistSuccess(input) {
      return db.transaction(async (tx) => {
        const now = new Date();
        const updated = await tx
          .update(agentRuns)
          .set({
            status: "succeeded",
            failureCode: null,
            provider: input.provider,
            model: input.model,
            inputRef: input.inputRef,
            outputJson: input.output,
            usageJson: input.usage ? { ...input.usage } : null,
            diagnosticsJson: input.diagnostics,
            latencyMs: input.latencyMs ?? null,
            completedAt: now,
            updatedAt: now
          })
          .where(
            and(
              eq(agentRuns.id, input.data.runId),
              eq(agentRuns.projectId, input.data.projectId),
              eq(agentRuns.status, "running")
            )
          )
          .returning({ id: agentRuns.id });

        if (updated.length === 0) {
          throw new OpportunityScoutEvidenceError(`Agent run ${input.data.runId} was not running at success commit.`);
        }

        if (input.output.briefs.length > 0) {
          await tx.insert(opportunities).values(
            input.output.briefs.map((brief) => ({
              projectId: input.data.projectId,
              agentRunId: input.data.runId,
              classification: brief.classification,
              primaryKeyword: brief.primaryKeyword,
              score: brief.score,
              status: opportunityLifecycleStatus(brief.recommendedAction),
              evidenceJson: brief,
              createdAt: now,
              updatedAt: now
            }))
          );
        }

        return { opportunityCount: input.output.briefs.length };
      });
    },

    async markFailed(input) {
      await db
        .update(agentRuns)
        .set({
          status: "failed",
          failureCode: input.failureCode,
          provider: input.provider,
          model: input.model,
          outputJson: input.outputJson,
          usageJson: input.usage ? { ...input.usage } : null,
          diagnosticsJson: input.diagnostics,
          latencyMs: input.latencyMs ?? null,
          completedAt: new Date(),
          updatedAt: new Date()
        })
        .where(
          and(
            eq(agentRuns.id, input.data.runId),
            eq(agentRuns.projectId, input.data.projectId),
            ne(agentRuns.status, "succeeded")
          )
        );
    }
  };
}

async function loadOpportunityScoutEvidence(db: WorkerDb, projectId: string): Promise<OpportunityScoutEvidence> {
  const [latestImport] = await db
    .select()
    .from(websiteImportRuns)
    .where(eq(websiteImportRuns.projectId, projectId))
    .orderBy(desc(websiteImportRuns.createdAt))
    .limit(1);

  const rows = await db
    .select()
    .from(gscSearchAnalyticsRows)
    .where(eq(gscSearchAnalyticsRows.projectId, projectId))
    .orderBy(desc(gscSearchAnalyticsRows.createdAt))
    .limit(50);

  const signals = await db
    .select()
    .from(gscOpportunitySignals)
    .where(eq(gscOpportunitySignals.projectId, projectId))
    .orderBy(desc(gscOpportunitySignals.createdAt))
    .limit(50);

  const recentTracking = await db
    .select()
    .from(trackingEvents)
    .where(eq(trackingEvents.projectId, projectId))
    .orderBy(desc(trackingEvents.occurredAt))
    .limit(50);

  const proposals = await db
    .select({ route: pageProposals.route })
    .from(pageProposals)
    .where(eq(pageProposals.projectId, projectId))
    .limit(100);

  const openOpportunities = await db
    .select({ evidenceJson: opportunities.evidenceJson })
    .from(opportunities)
    .where(and(eq(opportunities.projectId, projectId), ne(opportunities.status, "rejected")))
    .limit(100);

  const importSummary = recordFromUnknown(latestImport?.summaryJson);
  const importRoutes = stringArrayFromUnknown(importSummary.discoveredRoutes);
  const existingRoutes = [...new Set([...importRoutes, ...proposals.map((proposal) => proposal.route)])];
  const existingOpportunityKeys = openOpportunities
    .map((opportunity) => opportunityKeyFromJson(opportunity.evidenceJson))
    .filter((key): key is string => Boolean(key));

  const resolvableEvidence: ResolvableEvidenceRef[] = [
    ...(latestImport ? [{ sourceType: "website_import" as const, sourceId: latestImport.id }] : []),
    ...rows.map((row) => ({ sourceType: "gsc_row" as const, sourceId: row.id })),
    ...signals.map((signal) => ({ sourceType: "gsc_signal" as const, sourceId: signal.id })),
    ...recentTracking.map((event) => ({ sourceType: "tracking" as const, sourceId: event.id }))
  ];

  const packet = buildOpportunityScoutEvidencePacket({
    projectId,
    generatedAt: new Date().toISOString(),
    websiteImport: latestImport
      ? {
          sourceId: latestImport.id,
          sourceUrl: latestImport.sourceUrl,
          status: latestImport.status,
          artifactKey: latestImport.artifactKey,
          facts: importSummary.facts,
          discoveredRoutes: importRoutes
        }
      : undefined,
    gsc: {
      rows: rows.map((row) => ({
        sourceType: "gsc_row",
        sourceId: row.id,
        query: row.query,
        pageUrl: row.pageUrl,
        clicks: row.clicks,
        impressions: row.impressions,
        position: row.position,
        createdAt: row.createdAt.toISOString()
      })),
      signals: signals.map((signal) => ({
        sourceType: "gsc_signal",
        sourceId: signal.id,
        signalType: signal.signalType,
        status: signal.status,
        query: signal.query,
        pageUrl: signal.pageUrl,
        evidence: signal.evidenceJson
      }))
    },
    tracking: {
      recentEvents: recentTracking.map((event) => ({
        sourceType: "tracking",
        sourceId: event.id,
        eventName: event.eventName,
        route: event.route,
        componentId: event.componentId,
        occurredAt: event.occurredAt.toISOString()
      }))
    },
    existingRoutes,
    existingOpportunityKeys
  });

  return {
    packet,
    resolvableEvidence,
    existingRoutes: packet.existingRoutes,
    existingOpportunityKeys: packet.existingOpportunityKeys
  };
}

async function storeEvidencePacket(
  objectStorage: ObjectStoragePort,
  data: OpportunityScoutJobData,
  packet: OpportunityScoutEvidencePacket
): Promise<string> {
  const key = `agent-runs/${data.projectId}/${data.runId}/opportunity-scout-input.json`;
  const stored = await objectStorage.putJson({ key, value: packet });
  return stored.key;
}

async function markWorkflowFailure(
  repository: OpportunityScoutRepository,
  data: OpportunityScoutJobData,
  result: Extract<AiReasoningRunResult, { ok: true }>,
  failure: {
    failureCode: AiReasoningWorkflowFailureCode;
    diagnostics: Record<string, unknown>;
    outputJson: Record<string, unknown>;
  }
): Promise<void> {
  await repository.markFailed({
    data,
    failureCode: failure.failureCode,
    provider: result.provider,
    model: result.model,
    outputJson: failure.outputJson,
    usage: result.usage,
    diagnostics: {
      ...compactDiagnostics(result.diagnostics),
      ...failure.diagnostics
    },
    latencyMs: result.diagnostics.latencyMs
  });
}

function opportunityLifecycleStatus(action: string): string {
  if (action === "reject") {
    return "rejected";
  }
  if (action === "hold") {
    return "held";
  }
  if (action === "monitor") {
    return "monitoring";
  }
  return "new";
}

function compactDiagnostics(value: Record<string, unknown>): Record<string, unknown> {
  return truncateRecord(value, 2_000);
}

function compactOutputJson(value: unknown): Record<string, unknown> {
  return truncateRecord({ raw: value }, 64_000);
}

function truncateRecord(value: Record<string, unknown>, maxLength: number): Record<string, unknown> {
  const json = JSON.stringify(value);
  if (json.length <= maxLength) {
    return value;
  }
  return {
    truncated: true,
    preview: json.slice(0, maxLength)
  };
}

function opportunityKeyFromJson(value: unknown): string | undefined {
  const record = recordFromUnknown(value);
  const service = stringFromUnknown(record.service);
  const location = recordFromUnknown(record.location);
  const locationName = stringFromUnknown(location.name);

  if (!service || !locationName) {
    return undefined;
  }

  return normalizeOpportunityKey(service, locationName);
}

function normalizeOpportunityKey(service: string, locationName: string): string {
  return `${service}:${locationName}`.trim().toLowerCase().replace(/\s+/gu, " ");
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringArrayFromUnknown(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
