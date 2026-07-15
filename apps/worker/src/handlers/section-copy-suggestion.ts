import type { AiReasoningPort, AiReasoningRunResult, AiReasoningUsage, ObjectStoragePort } from "@localseo/adapters";
import {
  PageJsonSchema,
  SectionCopyRevisionOutputSchema,
  SectionCopySuggestionJobDataSchema,
  type AiReasoningAdapterFailureCode,
  type AiReasoningWorkflowFailureCode,
  type PageJson,
  type SectionCopySuggestionJobData
} from "@localseo/contracts";
import {
  buildSectionCopyEvidencePacket,
  buildSectionCopyPrompt,
  evaluateSectionCopyRevision,
  sectionCopyEvidencePacketLimits,
  type SectionCopyEvidencePacket
} from "@localseo/ai";
import { applyPageStudioEditCommand, decidePageStudioPublishReadiness } from "@localseo/domain";
import {
  agentRuns,
  isDatabaseUniqueViolation,
  loadResolvedPageVersionMediaVariants,
  pageProposals,
  pageSectionCopySuggestions,
  pageVersions
} from "@localseo/db";
import {
  buildPageMediaVariantPath,
  collectPageMediaAssetIds,
  getPageRegistryAiCopyFieldKeys,
  pageRegistrySummary,
  renderPagePreviewFile,
  type ResolvedPageMediaVariant,
  validatePageJsonAgainstRegistry,
  validatePageSectionProps
} from "@localseo/page-registry";
import type { Job } from "bullmq";
import { and, eq, inArray } from "drizzle-orm";
import type { WorkerDb, WorkerDbHandle } from "../job-run.js";
import { policyForReasoningTask } from "../reasoning-policy.js";

type AgentRunRow = typeof agentRuns.$inferSelect;

export type SectionCopySuggestionEvidence = {
  packet: SectionCopyEvidencePacket;
  pageJson: PageJson;
  currentProps: Record<string, unknown>;
  allowedCopyFields: string[];
  mediaVariants: ResolvedPageMediaVariant[];
};

export type SectionCopySuggestionRepository = {
  loadRun(data: SectionCopySuggestionJobData): Promise<AgentRunRow | undefined>;
  markRunning(data: SectionCopySuggestionJobData): Promise<boolean>;
  recordInputRef(input: { data: SectionCopySuggestionJobData; inputRef: string }): Promise<void>;
  loadEvidence(data: SectionCopySuggestionJobData): Promise<SectionCopySuggestionEvidence>;
  persistSuccess(input: {
    data: SectionCopySuggestionJobData;
    inputRef: string;
    outputJson: Record<string, unknown>;
    suggestedProps: Record<string, unknown>;
    provider: string;
    model: string;
    usage?: AiReasoningUsage;
    diagnostics: Record<string, unknown>;
    latencyMs?: number;
  }): Promise<void>;
  markFailed(input: {
    data: SectionCopySuggestionJobData;
    failureCode: AiReasoningAdapterFailureCode | AiReasoningWorkflowFailureCode;
    message: string;
    provider?: string;
    model?: string;
    outputJson?: Record<string, unknown>;
    usage?: AiReasoningUsage;
    diagnostics: Record<string, unknown>;
    latencyMs?: number;
  }): Promise<void>;
};

export class SectionCopySuggestionConfigurationError extends Error {}
export class SectionCopySuggestionEvidenceError extends Error {}
export class SectionCopySuggestionProviderError extends Error {}
export class SectionCopySuggestionWorkflowError extends Error {}

export async function handleSectionCopySuggestionJob(
  job: Job,
  dbHandle: WorkerDbHandle | undefined,
  reasoning: AiReasoningPort,
  objectStorage: ObjectStoragePort,
  options: { reasoningTimeoutMs?: number } = {}
): Promise<Record<string, unknown>> {
  const data = parseSectionCopySuggestionJobData(job.data);
  if (!dbHandle) {
    throw new SectionCopySuggestionConfigurationError("DATABASE_URL is required for section copy suggestion jobs");
  }

  return executeSectionCopySuggestion({
    data,
    repository: createDrizzleSectionCopySuggestionRepository(dbHandle.db),
    reasoning,
    objectStorage,
    reasoningTimeoutMs: options.reasoningTimeoutMs
  });
}

export async function executeSectionCopySuggestion(input: {
  data: SectionCopySuggestionJobData;
  repository: SectionCopySuggestionRepository;
  reasoning: AiReasoningPort;
  objectStorage: ObjectStoragePort;
  renderPreview?: typeof renderPagePreviewFile;
  reasoningTimeoutMs?: number;
}): Promise<Record<string, unknown>> {
  const run = await input.repository.loadRun(input.data);
  if (!run) {
    throw new SectionCopySuggestionEvidenceError(`Section copy run ${input.data.runId} was not found.`);
  }
  if (run.task !== "section_text_generation") {
    throw new SectionCopySuggestionEvidenceError(`Agent run ${input.data.runId} is not a section_text_generation run.`);
  }
  if (run.subjectId !== input.data.suggestionId) {
    throw new SectionCopySuggestionEvidenceError(`Agent run ${input.data.runId} is not scoped to this suggestion.`);
  }
  if (run.status === "succeeded") {
    return { status: "already_succeeded", runId: input.data.runId, suggestionId: input.data.suggestionId };
  }

  if (run.status !== "running") {
    const markedRunning = await input.repository.markRunning(input.data);
    if (!markedRunning) {
      const latest = await input.repository.loadRun(input.data);
      if (latest?.status === "succeeded") {
        return { status: "already_succeeded", runId: input.data.runId, suggestionId: input.data.suggestionId };
      }
      throw new SectionCopySuggestionEvidenceError(`Agent run ${input.data.runId} could not be marked running.`);
    }
  }

  let evidence: SectionCopySuggestionEvidence;
  try {
    evidence = await input.repository.loadEvidence(input.data);
  } catch (error) {
    const message = normalizeFailureMessage(error, "Section copy evidence could not be loaded.");
    await input.repository.markFailed({
      data: input.data,
      failureCode: "qa_rejected",
      message,
      diagnostics: { gateId: "evidence_load", message }
    });
    throw new SectionCopySuggestionEvidenceError(message, { cause: error });
  }

  const inputRef = await storeEvidencePacket(input.objectStorage, input.data, evidence.packet);
  await input.repository.recordInputRef({ data: input.data, inputRef });

  const reasoningResult = await input.reasoning.runStructured({
    task: "section_text_generation",
    projectId: input.data.projectId,
    runId: input.data.runId,
    prompt: buildSectionCopyPrompt(),
    inputJson: evidence.packet,
    outputSchemaName: "SectionCopyRevisionOutput",
    timeoutMs: input.reasoningTimeoutMs ?? 120_000,
    policy: policyForReasoningTask("section_text_generation")
  });

  if (!reasoningResult.ok) {
    await input.repository.markFailed({
      data: input.data,
      failureCode: reasoningResult.failureCode,
      message: reasoningResult.failureCode,
      provider: reasoningResult.provider,
      model: reasoningResult.model,
      diagnostics: compactDiagnostics(reasoningResult.diagnostics),
      latencyMs: reasoningResult.diagnostics.latencyMs
    });
    if (reasoningResult.failureCode === "provider_not_configured") {
      throw new SectionCopySuggestionConfigurationError(reasoningResult.failureCode);
    }
    throw new SectionCopySuggestionProviderError(reasoningResult.failureCode);
  }

  const parsedOutput = SectionCopyRevisionOutputSchema.safeParse(reasoningResult.outputJson);
  if (!parsedOutput.success) {
    await markWorkflowFailure(input.repository, input.data, reasoningResult, {
      failureCode: "output_schema_mismatch",
      message: "Section copy output did not match SectionCopyRevisionOutputSchema.",
      diagnostics: {
        gateId: "output_schema",
        issues: parsedOutput.error.issues.slice(0, 10)
      },
      outputJson: compactOutputJson(reasoningResult.outputJson)
    });
    throw new SectionCopySuggestionWorkflowError("output_schema_mismatch");
  }

  const qaResult = evaluateSectionCopyRevision({
    output: parsedOutput.data,
    sectionId: input.data.sectionId,
    currentProps: evidence.currentProps,
    allowedCopyFields: evidence.allowedCopyFields
  });
  if (!qaResult.ok) {
    await markWorkflowFailure(input.repository, input.data, reasoningResult, {
      failureCode: "qa_rejected",
      message: qaResult.failure.message,
      diagnostics: qaResult.failure,
      outputJson: compactOutputJson(parsedOutput.data)
    });
    throw new SectionCopySuggestionWorkflowError(`qa_rejected:${qaResult.failure.gateId}`);
  }

  const targetSection = evidence.pageJson.sections.find((section) => section.id === input.data.sectionId);
  if (!targetSection) {
    throw new SectionCopySuggestionEvidenceError("Section copy target disappeared from its immutable page version.");
  }
  const propsValidation = validatePageSectionProps(targetSection.registryKey, qaResult.suggestedProps);
  if (!propsValidation.success) {
    await markWorkflowFailure(input.repository, input.data, reasoningResult, {
      failureCode: "qa_rejected",
      message: "Section copy output failed registry prop validation.",
      diagnostics: { gateId: "registry_props", message: propsValidation.message },
      outputJson: compactOutputJson(parsedOutput.data)
    });
    throw new SectionCopySuggestionWorkflowError("qa_rejected:registry_props");
  }

  const mutation = applyPageStudioEditCommand({
    pageJson: evidence.pageJson,
    command: {
      type: "update_section_props",
      sectionId: input.data.sectionId,
      props: propsValidation.props
    },
    generation: {
      source: "agent",
      agentRunId: input.data.runId,
      reason: "page_studio:section_text_generation"
    },
    registryEntries: pageRegistrySummary
  });
  if (!mutation.success) {
    await markWorkflowFailure(input.repository, input.data, reasoningResult, {
      failureCode: "qa_rejected",
      message: `Section copy output could not form a Page Studio command: ${mutation.decision.reason}.`,
      diagnostics: { gateId: "page_studio_command", reason: mutation.decision.reason },
      outputJson: compactOutputJson(parsedOutput.data)
    });
    throw new SectionCopySuggestionWorkflowError("qa_rejected:page_studio_command");
  }

  const candidatePage = PageJsonSchema.safeParse(mutation.pageJson);
  if (!candidatePage.success) {
    await markWorkflowFailure(input.repository, input.data, reasoningResult, {
      failureCode: "qa_rejected",
      message: "Section copy candidate failed PageJson validation.",
      diagnostics: { gateId: "page_json", issues: candidatePage.error.issues.slice(0, 10) },
      outputJson: compactOutputJson(parsedOutput.data)
    });
    throw new SectionCopySuggestionWorkflowError("qa_rejected:page_json");
  }

  const registryValidation = validatePageJsonAgainstRegistry(candidatePage.data);
  if (!registryValidation.success) {
    await markWorkflowFailure(input.repository, input.data, reasoningResult, {
      failureCode: "qa_rejected",
      message: "Section copy candidate failed registry validation.",
      diagnostics: { gateId: "registry_validation", issues: registryValidation.issues.slice(0, 10) },
      outputJson: compactOutputJson(parsedOutput.data)
    });
    throw new SectionCopySuggestionWorkflowError("qa_rejected:registry_validation");
  }

  const readiness = decidePageStudioPublishReadiness(candidatePage.data, pageRegistrySummary);
  if (readiness.kind === "blocked") {
    await markWorkflowFailure(input.repository, input.data, reasoningResult, {
      failureCode: "qa_rejected",
      message: "Section copy candidate failed Page Studio composition checks.",
      diagnostics: { gateId: "page_studio_composition", issues: readiness.issues.slice(0, 10) },
      outputJson: compactOutputJson(parsedOutput.data)
    });
    throw new SectionCopySuggestionWorkflowError("qa_rejected:page_studio_composition");
  }

  try {
    (input.renderPreview ?? renderPagePreviewFile)({
      pageJson: candidatePage.data,
      pageVersionId: input.data.pageVersionId,
      previewId: input.data.suggestionId,
      targetUrl: candidatePage.data.route,
      mode: "editor",
      mediaVariants: evidence.mediaVariants
    });
  } catch (error) {
    const message = normalizeFailureMessage(error, "Section copy preview render failed.");
    await markWorkflowFailure(input.repository, input.data, reasoningResult, {
      failureCode: "qa_rejected",
      message,
      diagnostics: { gateId: "preview_render", message },
      outputJson: compactOutputJson(parsedOutput.data)
    });
    throw new SectionCopySuggestionWorkflowError("qa_rejected:preview_render", { cause: error });
  }

  await input.repository.persistSuccess({
    data: input.data,
    inputRef,
    outputJson: parsedOutput.data,
    suggestedProps: propsValidation.props,
    provider: reasoningResult.provider,
    model: reasoningResult.model,
    usage: reasoningResult.usage,
    diagnostics: {
      ...compactDiagnostics(reasoningResult.diagnostics),
      changedFieldKeys: qaResult.changedFieldKeys
    },
    latencyMs: reasoningResult.diagnostics.latencyMs
  });

  return {
    status: "succeeded",
    runId: input.data.runId,
    suggestionId: input.data.suggestionId,
    inputRef,
    changedFieldKeys: qaResult.changedFieldKeys
  };
}

export function parseSectionCopySuggestionJobData(data: unknown): SectionCopySuggestionJobData {
  const parsed = SectionCopySuggestionJobDataSchema.safeParse(data);
  if (!parsed.success) {
    throw new SectionCopySuggestionEvidenceError(
      "Section copy jobs require projectId, runId, suggestionId, pageVersionId, and sectionId."
    );
  }
  return parsed.data;
}

export function createDrizzleSectionCopySuggestionRepository(db: WorkerDb): SectionCopySuggestionRepository {
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
      try {
        return await db.transaction(async (tx) => {
          const now = new Date();
          const [run] = await tx
            .update(agentRuns)
            .set({
              status: "running",
              failureCode: null,
              provider: null,
              model: null,
              outputJson: null,
              usageJson: null,
              latencyMs: null,
              startedAt: now,
              completedAt: null,
              updatedAt: now
            })
            .where(
              and(
                eq(agentRuns.id, data.runId),
                eq(agentRuns.projectId, data.projectId),
                eq(agentRuns.subjectId, data.suggestionId),
                inArray(agentRuns.status, ["queued", "failed"])
              )
            )
            .returning({ id: agentRuns.id });
          if (!run) {
            return false;
          }

          const [suggestion] = await tx
            .update(pageSectionCopySuggestions)
            .set({
              status: "generating",
              failureCode: null,
              failureMessage: null,
              updatedAt: now
            })
            .where(
              and(
                eq(pageSectionCopySuggestions.id, data.suggestionId),
                eq(pageSectionCopySuggestions.projectId, data.projectId),
                eq(pageSectionCopySuggestions.pageVersionId, data.pageVersionId),
                eq(pageSectionCopySuggestions.sectionId, data.sectionId),
                eq(pageSectionCopySuggestions.agentRunId, data.runId),
                inArray(pageSectionCopySuggestions.status, ["queued", "failed"])
              )
            )
            .returning({ id: pageSectionCopySuggestions.id });
          if (!suggestion) {
            throw new SectionCopySuggestionEvidenceError("Section copy suggestion could not be marked generating.");
          }
          return true;
        });
      } catch (error) {
        if (isDatabaseUniqueViolation(error)) {
          return false;
        }
        throw error;
      }
    },

    async recordInputRef(input) {
      await db
        .update(agentRuns)
        .set({ inputRef: input.inputRef, updatedAt: new Date() })
        .where(
          and(
            eq(agentRuns.id, input.data.runId),
            eq(agentRuns.projectId, input.data.projectId),
            eq(agentRuns.status, "running")
          )
        );
    },

    async loadEvidence(data) {
      return loadSectionCopySuggestionEvidence(db, data);
    },

    async persistSuccess(input) {
      await db.transaction(async (tx) => {
        const now = new Date();
        const [run] = await tx
          .update(agentRuns)
          .set({
            status: "succeeded",
            failureCode: null,
            provider: input.provider,
            model: input.model,
            inputRef: input.inputRef,
            outputJson: input.outputJson,
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
              eq(agentRuns.subjectId, input.data.suggestionId),
              eq(agentRuns.status, "running")
            )
          )
          .returning({ id: agentRuns.id });
        if (!run) {
          throw new SectionCopySuggestionEvidenceError(
            `Agent run ${input.data.runId} was not running at suggestion success commit.`
          );
        }

        const [suggestion] = await tx
          .update(pageSectionCopySuggestions)
          .set({
            status: "ready",
            suggestedProps: input.suggestedProps,
            failureCode: null,
            failureMessage: null,
            readyAt: now,
            updatedAt: now
          })
          .where(
            and(
              eq(pageSectionCopySuggestions.id, input.data.suggestionId),
              eq(pageSectionCopySuggestions.projectId, input.data.projectId),
              eq(pageSectionCopySuggestions.agentRunId, input.data.runId),
              eq(pageSectionCopySuggestions.status, "generating")
            )
          )
          .returning({ id: pageSectionCopySuggestions.id });
        if (!suggestion) {
          throw new SectionCopySuggestionEvidenceError(
            `Suggestion ${input.data.suggestionId} was not generating at success commit.`
          );
        }
      });
    },

    async markFailed(input) {
      await db.transaction(async (tx) => {
        const now = new Date();
        await tx
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
            completedAt: now,
            updatedAt: now
          })
          .where(
            and(
              eq(agentRuns.id, input.data.runId),
              eq(agentRuns.projectId, input.data.projectId),
              eq(agentRuns.status, "running")
            )
          );

        await tx
          .update(pageSectionCopySuggestions)
          .set({
            status: "failed",
            failureCode: input.failureCode,
            failureMessage: input.message.slice(0, 500),
            updatedAt: now
          })
          .where(
            and(
              eq(pageSectionCopySuggestions.id, input.data.suggestionId),
              eq(pageSectionCopySuggestions.projectId, input.data.projectId),
              inArray(pageSectionCopySuggestions.status, ["queued", "generating", "failed"])
            )
          );
      });
    }
  };
}

async function loadSectionCopySuggestionEvidence(
  db: WorkerDb,
  data: SectionCopySuggestionJobData
): Promise<SectionCopySuggestionEvidence> {
  const [row] = await db
    .select({
      suggestionId: pageSectionCopySuggestions.id,
      projectId: pageSectionCopySuggestions.projectId,
      pageVersionId: pageSectionCopySuggestions.pageVersionId,
      sectionId: pageSectionCopySuggestions.sectionId,
      agentRunId: pageSectionCopySuggestions.agentRunId,
      status: pageSectionCopySuggestions.status,
      instruction: pageSectionCopySuggestions.instruction,
      route: pageProposals.route,
      primaryKeyword: pageProposals.primaryKeyword,
      pageJson: pageVersions.pageJson
    })
    .from(pageSectionCopySuggestions)
    .innerJoin(pageVersions, eq(pageSectionCopySuggestions.pageVersionId, pageVersions.id))
    .innerJoin(pageProposals, eq(pageVersions.pageProposalId, pageProposals.id))
    .where(
      and(
        eq(pageSectionCopySuggestions.id, data.suggestionId),
        eq(pageSectionCopySuggestions.projectId, data.projectId),
        eq(pageSectionCopySuggestions.pageVersionId, data.pageVersionId),
        eq(pageSectionCopySuggestions.sectionId, data.sectionId),
        eq(pageSectionCopySuggestions.agentRunId, data.runId),
        eq(pageProposals.projectId, data.projectId)
      )
    )
    .limit(1);

  if (!row) {
    throw new SectionCopySuggestionEvidenceError(
      `Suggestion ${data.suggestionId} was not found for this project and page version.`
    );
  }
  if (row.status !== "generating") {
    throw new SectionCopySuggestionEvidenceError(`Suggestion ${data.suggestionId} is not generating.`);
  }

  const pageJson = PageJsonSchema.safeParse(row.pageJson);
  if (!pageJson.success) {
    throw new SectionCopySuggestionEvidenceError("Stored PageJson failed contract validation for section copy.");
  }
  if (pageJson.data.route !== row.route || pageJson.data.target.primaryKeyword !== row.primaryKeyword) {
    throw new SectionCopySuggestionEvidenceError("Stored PageJson projections do not match the page proposal.");
  }
  const registryValidation = validatePageJsonAgainstRegistry(pageJson.data);
  if (!registryValidation.success) {
    throw new SectionCopySuggestionEvidenceError("Stored PageJson failed registry validation for section copy.");
  }

  const mediaRecords = await loadResolvedPageVersionMediaVariants(db, {
    projectId: data.projectId,
    pageVersions: [
      {
        pageVersionId: data.pageVersionId,
        assetIds: collectPageMediaAssetIds(registryValidation.pageJson)
      }
    ]
  });
  const mediaVariants = mediaRecords.map((record) => ({
    assetId: record.assetId,
    variantKey: record.variantKey,
    width: record.width,
    height: record.height,
    contentType: record.contentType,
    byteSize: record.bytes,
    sha256: record.checksumSha256,
    path: buildPageMediaVariantPath({
      assetId: record.assetId,
      sha256: record.checksumSha256,
      width: record.width
    })
  }));

  const currentSection = pageJson.data.sections.find((section) => section.id === data.sectionId);
  if (!currentSection) {
    throw new SectionCopySuggestionEvidenceError(
      `Section ${data.sectionId} does not exist in the pinned page version.`
    );
  }
  const allowedCopyFields = getPageRegistryAiCopyFieldKeys(currentSection.registryKey);
  if (allowedCopyFields.length === 0) {
    throw new SectionCopySuggestionEvidenceError("The selected section has no registry-approved AI copy fields.");
  }

  const surroundingSections = pageJson.data.sections
    .filter((section) => section.id !== currentSection.id)
    .sort(
      (left, right) =>
        Math.abs(left.order - currentSection.order) - Math.abs(right.order - currentSection.order) ||
        left.order - right.order
    )
    .slice(0, sectionCopyEvidencePacketLimits.surroundingSections)
    .map((section) => ({
      id: section.id,
      type: section.type,
      registryKey: section.registryKey,
      order: section.order,
      props: section.props
    }));

  const packet = buildSectionCopyEvidencePacket({
    projectId: data.projectId,
    runId: data.runId,
    suggestionId: data.suggestionId,
    pageVersionId: data.pageVersionId,
    generatedAt: new Date().toISOString(),
    instruction: row.instruction ?? undefined,
    pageContext: {
      route: pageJson.data.route,
      pageType: pageJson.data.pageType,
      target: pageJson.data.target,
      seo: {
        title: pageJson.data.seo.title,
        metaDescription: pageJson.data.seo.metaDescription
      }
    },
    currentSection: {
      id: currentSection.id,
      type: currentSection.type,
      registryKey: currentSection.registryKey,
      schemaVersion: currentSection.schemaVersion,
      zone: currentSection.zone,
      variant: currentSection.variant,
      props: currentSection.props,
      evidenceRefs: currentSection.evidenceRefs
    },
    surroundingSections,
    allowedCopyFields
  });

  if (Buffer.byteLength(JSON.stringify(packet), "utf8") > sectionCopyEvidencePacketLimits.serializedBytes) {
    throw new SectionCopySuggestionEvidenceError("Section copy evidence packet exceeds its serialized byte budget.");
  }

  return {
    packet,
    pageJson: pageJson.data,
    currentProps: currentSection.props,
    allowedCopyFields,
    mediaVariants
  };
}

async function storeEvidencePacket(
  objectStorage: ObjectStoragePort,
  data: SectionCopySuggestionJobData,
  packet: SectionCopyEvidencePacket
): Promise<string> {
  const key = `agent-runs/${data.projectId}/${data.runId}/section-copy-input.json`;
  const stored = await objectStorage.putJson({ key, value: packet });
  return stored.key;
}

async function markWorkflowFailure(
  repository: SectionCopySuggestionRepository,
  data: SectionCopySuggestionJobData,
  result: Extract<AiReasoningRunResult, { ok: true }>,
  failure: {
    failureCode: AiReasoningWorkflowFailureCode;
    message: string;
    diagnostics: Record<string, unknown>;
    outputJson: Record<string, unknown>;
  }
): Promise<void> {
  await repository.markFailed({
    data,
    failureCode: failure.failureCode,
    message: failure.message,
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

function compactDiagnostics(value: Record<string, unknown>): Record<string, unknown> {
  return truncateRecord(value, 2_000);
}

function compactOutputJson(value: unknown): Record<string, unknown> {
  return truncateRecord({ raw: value }, 64_000);
}

function truncateRecord(value: Record<string, unknown>, maxLength: number): Record<string, unknown> {
  const json = JSON.stringify(value);
  return json.length <= maxLength ? value : { truncated: true, preview: json.slice(0, maxLength) };
}

function normalizeFailureMessage(error: unknown, fallback: string): string {
  return (error instanceof Error ? error.message : fallback).slice(0, 500);
}
