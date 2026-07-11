import type { AiReasoningPort, AiReasoningRunResult, AiReasoningUsage, ObjectStoragePort } from "@localseo/adapters";
import {
  OpportunityBriefSchema,
  PageProposalJobDataSchema,
  PageProposalJsonSchema,
  type AiReasoningAdapterFailureCode,
  type AiReasoningWorkflowFailureCode,
  type PageProposalJobData,
  type PageProposalJson
} from "@localseo/contracts";
import {
  attributePageProposalGeneration,
  buildPageProposalEvidencePacket,
  buildPageProposalPrompt,
  evaluatePageProposalOutput,
  type PageProposalEvidencePacket,
  type ResolvableEvidenceRef
} from "@localseo/ai";
import { decidePageStudioPublishReadiness } from "@localseo/domain";
import { agentRuns, isDatabaseUniqueViolation, opportunities, pageProposals, pageVersions } from "@localseo/db";
import { pageRegistrySummary, renderPagePreviewFile, validatePageJsonAgainstRegistry } from "@localseo/page-registry";
import type { Job } from "bullmq";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { WorkerDb, WorkerDbHandle } from "../job-run.js";
import { policyForReasoningTask } from "../reasoning-policy.js";

type AgentRunRow = typeof agentRuns.$inferSelect;

export type PageProposalEvidence = {
  packet: PageProposalEvidencePacket;
  resolvableEvidence: ResolvableEvidenceRef[];
  existingRoutes: string[];
};

export type PersistedPageProposal = {
  pageProposalId: string;
  pageVersionId: string;
  route: string;
  versionNumber: number;
};

export type PageProposalRepository = {
  loadRun(data: PageProposalJobData): Promise<AgentRunRow | undefined>;
  markRunning(data: PageProposalJobData): Promise<boolean>;
  recordInputRef(input: { data: PageProposalJobData; inputRef: string }): Promise<void>;
  loadEvidence(data: PageProposalJobData): Promise<PageProposalEvidence>;
  persistSuccess(input: {
    data: PageProposalJobData;
    inputRef: string;
    output: PageProposalJson;
    provider: string;
    model: string;
    usage?: AiReasoningUsage;
    diagnostics: Record<string, unknown>;
    latencyMs?: number;
  }): Promise<PersistedPageProposal>;
  markFailed(input: {
    data: PageProposalJobData;
    failureCode: AiReasoningAdapterFailureCode | AiReasoningWorkflowFailureCode;
    provider?: string;
    model?: string;
    outputJson?: Record<string, unknown>;
    usage?: AiReasoningUsage;
    diagnostics: Record<string, unknown>;
    latencyMs?: number;
  }): Promise<void>;
};

export class PageProposalConfigurationError extends Error {}
export class PageProposalEvidenceError extends Error {}
export class PageProposalProviderError extends Error {}
export class PageProposalWorkflowError extends Error {}
export class PageProposalPersistenceEligibilityError extends Error {}
class PageProposalPersistenceConflictError extends Error {}

export async function handlePageProposalJob(
  job: Job,
  dbHandle: WorkerDbHandle | undefined,
  reasoning: AiReasoningPort,
  objectStorage: ObjectStoragePort,
  options: { reasoningTimeoutMs?: number } = {}
): Promise<Record<string, unknown>> {
  const data = parsePageProposalJobData(job.data);

  if (!dbHandle) {
    throw new PageProposalConfigurationError("DATABASE_URL is required for page proposal jobs");
  }

  return executePageProposal({
    data,
    repository: createDrizzlePageProposalRepository(dbHandle.db),
    reasoning,
    objectStorage,
    reasoningTimeoutMs: options.reasoningTimeoutMs
  });
}

export async function executePageProposal(input: {
  data: PageProposalJobData;
  repository: PageProposalRepository;
  reasoning: AiReasoningPort;
  objectStorage: ObjectStoragePort;
  renderPreview?: typeof renderPagePreviewFile;
  reasoningTimeoutMs?: number;
}): Promise<Record<string, unknown>> {
  const run = await input.repository.loadRun(input.data);

  if (!run) {
    throw new PageProposalEvidenceError(`Page proposal run ${input.data.runId} was not found.`);
  }

  if (run.task !== "page_brief_draft") {
    throw new PageProposalEvidenceError(`Agent run ${input.data.runId} is not a page_brief_draft run.`);
  }
  if (run.subjectId !== input.data.opportunityId) {
    throw new PageProposalEvidenceError(`Agent run ${input.data.runId} is not scoped to this opportunity.`);
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
      throw new PageProposalEvidenceError(`Agent run ${input.data.runId} could not be marked running.`);
    }
  }

  const evidence = await input.repository.loadEvidence(input.data);
  const inputRef = await storeEvidencePacket(input.objectStorage, input.data, evidence.packet);
  await input.repository.recordInputRef({ data: input.data, inputRef });

  const reasoningResult = await input.reasoning.runStructured({
    task: "page_brief_draft",
    projectId: input.data.projectId,
    runId: input.data.runId,
    prompt: buildPageProposalPrompt(),
    inputJson: evidence.packet,
    outputSchemaName: "PageProposalJson",
    timeoutMs: input.reasoningTimeoutMs ?? 120_000,
    policy: policyForReasoningTask("page_brief_draft")
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
    if (reasoningResult.failureCode === "provider_not_configured") {
      throw new PageProposalConfigurationError(reasoningResult.failureCode);
    }
    throw new PageProposalProviderError(reasoningResult.failureCode);
  }

  const parsedOutput = PageProposalJsonSchema.safeParse(reasoningResult.outputJson);
  if (!parsedOutput.success) {
    await markWorkflowFailure(input.repository, input.data, reasoningResult, {
      failureCode: "output_schema_mismatch",
      diagnostics: {
        message: "Page proposal output did not match PageProposalJsonSchema.",
        issues: parsedOutput.error.issues.slice(0, 10)
      },
      outputJson: compactOutputJson(reasoningResult.outputJson)
    });
    throw new PageProposalWorkflowError("output_schema_mismatch");
  }

  const attributedOutput = attributePageProposalGeneration(parsedOutput.data, input.data.runId);

  const qaResult = evaluatePageProposalOutput({
    projectId: input.data.projectId,
    opportunityId: input.data.opportunityId,
    output: attributedOutput,
    resolvableEvidence: evidence.resolvableEvidence,
    existingRoutes: evidence.existingRoutes
  });

  if (!qaResult.ok) {
    await markWorkflowFailure(input.repository, input.data, reasoningResult, {
      failureCode: "qa_rejected",
      diagnostics: qaResult.failure,
      outputJson: compactOutputJson(parsedOutput.data)
    });
    throw new PageProposalWorkflowError(`qa_rejected:${qaResult.failure.gateId}`);
  }

  const registryValidation = validatePageJsonAgainstRegistry(qaResult.output.page);
  if (!registryValidation.success) {
    await markWorkflowFailure(input.repository, input.data, reasoningResult, {
      failureCode: "qa_rejected",
      diagnostics: {
        gateId: "registry_validation",
        message: "PageProposalJson.page failed registry validation.",
        issues: registryValidation.issues.slice(0, 10)
      },
      outputJson: compactOutputJson(qaResult.output)
    });
    throw new PageProposalWorkflowError("qa_rejected:registry_validation");
  }

  const publishReadiness = decidePageStudioPublishReadiness(qaResult.output.page, pageRegistrySummary);
  if (publishReadiness.kind === "blocked") {
    await markWorkflowFailure(input.repository, input.data, reasoningResult, {
      failureCode: "qa_rejected",
      diagnostics: {
        gateId: "page_studio_composition",
        message: "PageProposalJson.page failed Page Studio composition checks.",
        issues: publishReadiness.issues.slice(0, 10)
      },
      outputJson: compactOutputJson(qaResult.output)
    });
    throw new PageProposalWorkflowError("qa_rejected:page_studio_composition");
  }

  try {
    const renderPreview = input.renderPreview ?? renderPagePreviewFile;
    renderPreview({
      pageJson: qaResult.output.page,
      targetUrl: qaResult.output.route,
      mode: "editor",
      previewId: input.data.runId
    });
  } catch (error) {
    await markWorkflowFailure(input.repository, input.data, reasoningResult, {
      failureCode: "qa_rejected",
      diagnostics: {
        gateId: "preview_render",
        message: normalizePreviewRenderFailure(error)
      },
      outputJson: compactOutputJson(qaResult.output)
    });
    throw new PageProposalWorkflowError("qa_rejected:preview_render", { cause: error });
  }

  let persisted: PersistedPageProposal;
  try {
    persisted = await input.repository.persistSuccess({
      data: input.data,
      inputRef,
      output: qaResult.output,
      provider: reasoningResult.provider,
      model: reasoningResult.model,
      usage: reasoningResult.usage,
      diagnostics: compactDiagnostics(reasoningResult.diagnostics),
      latencyMs: reasoningResult.diagnostics.latencyMs
    });
  } catch (error) {
    if (error instanceof PageProposalPersistenceConflictError) {
      await markWorkflowFailure(input.repository, input.data, reasoningResult, {
        failureCode: "qa_rejected",
        diagnostics: {
          gateId: "route_collision",
          message: error.message
        },
        outputJson: compactOutputJson(qaResult.output)
      });
      throw new PageProposalWorkflowError("qa_rejected:route_collision");
    }

    if (error instanceof PageProposalPersistenceEligibilityError) {
      await markWorkflowFailure(input.repository, input.data, reasoningResult, {
        failureCode: "qa_rejected",
        diagnostics: {
          gateId: "opportunity_lifecycle",
          message: error.message
        },
        outputJson: compactOutputJson(qaResult.output)
      });
      throw new PageProposalWorkflowError("qa_rejected:opportunity_lifecycle", { cause: error });
    }

    throw error;
  }

  return {
    status: "succeeded",
    runId: input.data.runId,
    inputRef,
    ...persisted
  };
}

export function parsePageProposalJobData(data: unknown): PageProposalJobData {
  const parsed = PageProposalJobDataSchema.safeParse(data);

  if (!parsed.success) {
    throw new PageProposalEvidenceError("Page proposal jobs require projectId, runId, and opportunityId.");
  }

  return parsed.data;
}

export function createDrizzlePageProposalRepository(db: WorkerDb): PageProposalRepository {
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
      return loadPageProposalEvidence(db, data);
    },

    async persistSuccess(input) {
      try {
        return await db.transaction(async (tx) => {
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
            throw new PageProposalEvidenceError(`Agent run ${input.data.runId} was not running at success commit.`);
          }

          const [proposal] = await tx
            .insert(pageProposals)
            .values({
              projectId: input.data.projectId,
              opportunityId: input.data.opportunityId,
              route: input.output.route,
              primaryKeyword: input.output.primaryKeyword,
              uniquenessRationale:
                input.output.page.uniquenessRationale ?? input.output.proposalRationale ?? "Generated page proposal.",
              status: "draft",
              sitemapReady: input.output.page.seo.sitemapReady,
              proposalJson: input.output,
              createdAt: now,
              updatedAt: now
            })
            .returning();

          if (!proposal) {
            throw new PageProposalEvidenceError("Failed to persist page proposal.");
          }

          const [version] = await tx
            .insert(pageVersions)
            .values({
              pageProposalId: proposal.id,
              versionNumber: 1,
              status: "preview",
              pageJson: input.output.page,
              createdAt: now,
              updatedAt: now
            })
            .returning();

          if (!version) {
            throw new PageProposalEvidenceError("Failed to persist page proposal version.");
          }

          const [updatedOpportunity] = await tx
            .update(opportunities)
            .set({
              status: "brief_created",
              updatedAt: now
            })
            .where(
              and(
                eq(opportunities.id, input.data.opportunityId),
                eq(opportunities.projectId, input.data.projectId),
                ne(opportunities.status, "rejected")
              )
            )
            .returning({ id: opportunities.id });

          if (!updatedOpportunity) {
            throw new PageProposalPersistenceEligibilityError(
              "Opportunity is no longer eligible for page proposal persistence."
            );
          }

          return {
            pageProposalId: proposal.id,
            pageVersionId: version.id,
            route: proposal.route,
            versionNumber: version.versionNumber
          };
        });
      } catch (error) {
        if (isDatabaseUniqueViolation(error)) {
          throw new PageProposalPersistenceConflictError(
            `Page proposal route ${input.output.route} already exists for this project.`
          );
        }

        throw error;
      }
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

async function loadPageProposalEvidence(db: WorkerDb, data: PageProposalJobData): Promise<PageProposalEvidence> {
  const [opportunity] = await db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.id, data.opportunityId), eq(opportunities.projectId, data.projectId)))
    .limit(1);

  if (!opportunity) {
    throw new PageProposalEvidenceError(`Opportunity ${data.opportunityId} was not found for this project.`);
  }

  if (opportunity.status === "rejected") {
    throw new PageProposalEvidenceError("Rejected opportunities cannot create page proposals.");
  }

  const brief = OpportunityBriefSchema.safeParse(opportunity.evidenceJson);
  if (!brief.success) {
    throw new PageProposalEvidenceError(
      "Opportunity evidenceJson must parse as OpportunityBrief before page proposal."
    );
  }

  const proposals = await db
    .select({ route: pageProposals.route })
    .from(pageProposals)
    .where(eq(pageProposals.projectId, data.projectId))
    .orderBy(desc(pageProposals.createdAt))
    .limit(100);

  const resolvableEvidence = collectResolvableEvidence(brief.data);
  const packet = buildPageProposalEvidencePacket({
    projectId: data.projectId,
    runId: data.runId,
    generatedAt: new Date().toISOString(),
    opportunity: {
      id: opportunity.id,
      primaryKeyword: opportunity.primaryKeyword,
      service: brief.data.service,
      locationName: brief.data.location.name,
      suggestedRoute: brief.data.suggestedRoute,
      uniquenessRationale: brief.data.uniquenessRationale,
      evidenceJson: brief.data
    },
    existingRoutes: proposals.map((proposal) => proposal.route),
    registrySummary: pageRegistrySummary.map((entry) => ({ ...entry }))
  });

  return {
    packet,
    resolvableEvidence,
    existingRoutes: packet.existingRoutes
  };
}

async function storeEvidencePacket(
  objectStorage: ObjectStoragePort,
  data: PageProposalJobData,
  packet: PageProposalEvidencePacket
): Promise<string> {
  const key = `agent-runs/${data.projectId}/${data.runId}/page-proposal-input.json`;
  const stored = await objectStorage.putJson({ key, value: packet });
  return stored.key;
}

async function markWorkflowFailure(
  repository: PageProposalRepository,
  data: PageProposalJobData,
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

function collectResolvableEvidence(brief: ReturnType<typeof OpportunityBriefSchema.parse>): ResolvableEvidenceRef[] {
  return [...brief.evidence, ...brief.location.evidence, ...brief.groupHints.flatMap((group) => group.evidence)]
    .filter((evidence): evidence is typeof evidence & { sourceId: string } => Boolean(evidence.sourceId))
    .map((evidence) => ({
      sourceType: evidence.sourceType,
      sourceId: evidence.sourceId,
      rank: typeof evidence.observedMetric?.value === "number" ? evidence.observedMetric.value : undefined,
      query: typeof evidence.locator?.query === "string" ? evidence.locator.query : undefined,
      pageUrl: typeof evidence.locator?.pageUrl === "string" ? evidence.locator.pageUrl : undefined
    }));
}

function compactDiagnostics(value: Record<string, unknown>): Record<string, unknown> {
  return truncateRecord(value, 2_000);
}

function compactOutputJson(value: unknown): Record<string, unknown> {
  return truncateRecord({ raw: value }, 64_000);
}

function normalizePreviewRenderFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "Page proposal preview render failed.";
  return message.slice(0, 500);
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
