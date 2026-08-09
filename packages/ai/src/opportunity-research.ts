import { createHash } from "node:crypto";
import { createStep, createWorkflow, type WorkflowRunStatus } from "@mastra/core/workflows";
import { Mastra } from "@mastra/core/mastra";
import type { MastraCompositeStore } from "@mastra/core/storage";
import { MastraCompositeStore as CompositeStore } from "@mastra/core/storage";
import { WorkflowsPG } from "@mastra/pg";
import {
  OpportunityResearchAgentOutputSchema,
  OpportunityResearchPlanStepOutputSchema,
  OpportunityResearchResearchStepOutputSchema,
  OpportunityResearchWorkflowInputSchema,
  OpportunityResearchWorkflowOutputSchema,
  OpportunityStrategyAgentOutputSchema,
  PublicWebSearchCaptureSchema,
  opportunityResearchConstraintProfileVersion,
  opportunityResearchStepKeys,
  opportunityResearchWorkflowVersion,
  type OpportunityResearchAgentOutput,
  type OpportunityResearchResearchStepOutput,
  type OpportunityResearchWorkflowInput,
  type OpportunityResearchWorkflowOutput,
  type OpportunityStrategyAgentOutput,
  type PublicWebSearchCapture,
  type PublicWebSearchRequest
} from "@localseo/contracts";

export { opportunityResearchConstraintProfileVersion, opportunityResearchStepKeys, opportunityResearchWorkflowVersion };

export type OpportunityResearchModelUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
};

export type OpportunityResearchModelResult<T> = {
  output: T;
  provider: string;
  model: string;
  usage?: OpportunityResearchModelUsage;
};

export interface OpportunityResearchModelPort {
  research(
    input: {
      workflowInput: OpportunityResearchWorkflowInput;
      captures: readonly PublicWebSearchCapture[];
    },
    signal?: AbortSignal
  ): Promise<OpportunityResearchModelResult<OpportunityResearchAgentOutput>>;
  strategy(
    input: OpportunityResearchResearchStepOutput,
    signal?: AbortSignal
  ): Promise<OpportunityResearchModelResult<OpportunityStrategyAgentOutput>>;
}

export interface PublicWebSearchPort {
  search(input: PublicWebSearchRequest): Promise<PublicWebSearchCapture>;
}

export type OpportunityResearchAgentStepDefinition<T> = {
  stepKey: typeof opportunityResearchStepKeys.researchPlan | typeof opportunityResearchStepKeys.strategy;
  agentRole: "ResearchAgent" | "SeoStrategyAgent";
  input: unknown;
  parseOutput: (value: unknown) => T;
  execute: () => Promise<OpportunityResearchModelResult<T>>;
};

export type OpportunityResearchToolStepDefinition<T> = {
  stepKey: typeof opportunityResearchStepKeys.followUpCapture;
  toolKey: "public_web_search_follow_up";
  input: unknown;
  parseOutput: (value: unknown) => T;
  execute: () => Promise<T>;
};

export interface OpportunityResearchExecutionBoundary {
  executeAgentStep<T>(definition: OpportunityResearchAgentStepDefinition<T>): Promise<T>;
  executeToolStep<T>(definition: OpportunityResearchToolStepDefinition<T>): Promise<T>;
  executePublicWebSearch(input: {
    parentStepKey: typeof opportunityResearchStepKeys.researchPlan | typeof opportunityResearchStepKeys.followUpCapture;
    request: Omit<PublicWebSearchRequest, "executionEpoch">;
    execute: (request: PublicWebSearchRequest) => Promise<PublicWebSearchCapture>;
  }): Promise<PublicWebSearchCapture>;
}

export interface OpportunityResearchPort {
  run(
    input: OpportunityResearchWorkflowInput,
    boundary: OpportunityResearchExecutionBoundary,
    signal?: AbortSignal
  ): Promise<OpportunityResearchWorkflowOutput>;
}

export interface OpportunityResearchWorkflowRuntime {
  initialize(): Promise<void>;
  close(): Promise<void>;
  createAdapter(model: OpportunityResearchModelPort, publicWebSearch: PublicWebSearchPort): OpportunityResearchPort;
}

export const opportunityResearchMastraSchemaName = "mastra_workflows";

export function createOpportunityResearchWorkflowRuntime(
  connectionString: string | undefined
): OpportunityResearchWorkflowRuntime | undefined {
  if (!connectionString) return undefined;

  const workflows = new WorkflowsPG({ connectionString, schemaName: opportunityResearchMastraSchemaName });
  const storage = new CompositeStore({
    id: "localseo-opportunity-research-workflows",
    domains: { workflows }
  });

  return {
    async initialize() {
      await storage.init();
    },
    async close() {
      const close = (workflows as unknown as { close?: () => Promise<void> }).close;
      if (close) await close.call(workflows);
    },
    createAdapter(model, publicWebSearch) {
      return new MastraOpportunityResearchAdapter(model, publicWebSearch, { workflowStorage: storage });
    }
  };
}

export class OpportunityResearchRuntimeError extends Error {
  constructor(
    message: string,
    readonly code:
      | "provider_not_configured"
      | "provider_timeout"
      | "provider_unavailable"
      | "provider_response_invalid"
      | "model_egress_blocked"
      | "workflow_failed"
  ) {
    super(message);
  }
}

export function opportunityResearchRuntimePublicMessage(code: OpportunityResearchRuntimeError["code"]): string {
  switch (code) {
    case "provider_not_configured":
      return "Opportunity Research provider is not configured.";
    case "provider_timeout":
      return "Opportunity Research provider timed out.";
    case "provider_unavailable":
      return "Opportunity Research provider is unavailable.";
    case "provider_response_invalid":
      return "Opportunity Research provider returned invalid structured output.";
    case "model_egress_blocked":
      return "Opportunity Research model input contains blocked secret-like material.";
    case "workflow_failed":
      return "Opportunity Research workflow failed.";
  }
}

export class MastraOpportunityResearchAdapter implements OpportunityResearchPort {
  constructor(
    private readonly model: OpportunityResearchModelPort,
    private readonly publicWebSearch: PublicWebSearchPort,
    private readonly options: { workflowStorage?: MastraCompositeStore } = {}
  ) {}

  async run(
    input: OpportunityResearchWorkflowInput,
    boundary: OpportunityResearchExecutionBoundary,
    signal?: AbortSignal
  ): Promise<OpportunityResearchWorkflowOutput> {
    signal?.throwIfAborted();
    const parsedInput = OpportunityResearchWorkflowInputSchema.parse(input);
    const workflow = this.createWorkflow(boundary, signal);
    const executableWorkflow = this.options.workflowStorage
      ? new Mastra({
          storage: this.options.workflowStorage,
          workflows: { opportunityResearch: workflow }
        }).getWorkflow("opportunityResearch")
      : workflow;
    const stored = await executableWorkflow.getWorkflowRunById(parsedInput.runId, { fields: ["result"] });
    const action = opportunityResearchMastraResumeAction(stored?.status);
    if (action === "reject") {
      throw new OpportunityResearchRuntimeError(
        "Opportunity Research workflow is suspended and cannot be resumed by bounded recovery.",
        "workflow_failed"
      );
    }
    if (action === "replay") {
      return OpportunityResearchWorkflowOutputSchema.parse(stored?.result);
    }
    const run = await executableWorkflow.createRun({ runId: parsedInput.runId, resourceId: parsedInput.projectId });
    const result = action === "restart" ? await run.restart() : await run.start({ inputData: parsedInput });
    if (result.status !== "success") {
      throw new OpportunityResearchRuntimeError(
        opportunityResearchRuntimePublicMessage("workflow_failed"),
        "workflow_failed"
      );
    }
    return OpportunityResearchWorkflowOutputSchema.parse(result.result);
  }

  private createWorkflow(boundary: OpportunityResearchExecutionBoundary, signal?: AbortSignal) {
    const researchPlanStep = createStep({
      id: opportunityResearchStepKeys.researchPlan,
      inputSchema: OpportunityResearchWorkflowInputSchema,
      outputSchema: OpportunityResearchPlanStepOutputSchema,
      execute: async ({ inputData }) =>
        boundary.executeAgentStep({
          stepKey: opportunityResearchStepKeys.researchPlan,
          agentRole: "ResearchAgent",
          input: inputData,
          parseOutput: (value) => OpportunityResearchPlanStepOutputSchema.parse(value),
          execute: async () => {
            const initialCaptures = await this.captureQueries({
              input: inputData,
              queries: inputData.initialQueries,
              round: 1,
              ordinalOffset: 0,
              boundary,
              signal
            });
            const researchResult = await this.model.research(
              {
                workflowInput: inputData,
                captures: initialCaptures
              },
              signal
            );
            const research = OpportunityResearchAgentOutputSchema.parse(researchResult.output);
            const initialKeys = new Set(inputData.initialQueries.map(normalizeQuery));
            const followUpQueries = research.followUpQueries
              .filter((query) => !initialKeys.has(normalizeQuery(query)))
              .slice(0, Math.max(0, 12 - initialCaptures.length));
            return {
              ...researchResult,
              output: OpportunityResearchPlanStepOutputSchema.parse({
                projectId: inputData.projectId,
                runId: inputData.runId,
                materialDigest: inputData.materialDigest,
                maxCandidates: inputData.maxCandidates,
                requestedLocale: inputData.requestedLocale,
                requestedRegion: inputData.requestedRegion,
                evidencePacket: inputData.evidencePacket,
                initialCaptures,
                plannedFollowUpQueries: followUpQueries,
                research
              })
            };
          }
        })
    });

    const followUpCaptureStep = createStep({
      id: opportunityResearchStepKeys.followUpCapture,
      inputSchema: OpportunityResearchPlanStepOutputSchema,
      outputSchema: OpportunityResearchResearchStepOutputSchema,
      execute: async ({ inputData }) =>
        boundary.executeToolStep({
          stepKey: opportunityResearchStepKeys.followUpCapture,
          toolKey: "public_web_search_follow_up",
          input: inputData,
          parseOutput: (value) => OpportunityResearchResearchStepOutputSchema.parse(value),
          execute: async () => {
            const followUpCaptures = await this.captureQueries({
              input: {
                projectId: inputData.projectId,
                runId: inputData.runId,
                requestedLocale: inputData.requestedLocale,
                requestedRegion: inputData.requestedRegion
              },
              queries: inputData.plannedFollowUpQueries,
              round: 2,
              ordinalOffset: inputData.initialCaptures.length,
              boundary,
              signal
            });
            return OpportunityResearchResearchStepOutputSchema.parse({
              projectId: inputData.projectId,
              runId: inputData.runId,
              materialDigest: inputData.materialDigest,
              maxCandidates: inputData.maxCandidates,
              evidencePacket: inputData.evidencePacket,
              captures: [...inputData.initialCaptures, ...followUpCaptures],
              research: inputData.research
            });
          }
        })
    });

    const strategyStep = createStep({
      id: opportunityResearchStepKeys.strategy,
      inputSchema: OpportunityResearchResearchStepOutputSchema,
      outputSchema: OpportunityResearchWorkflowOutputSchema,
      execute: async ({ inputData }) =>
        boundary.executeAgentStep({
          stepKey: opportunityResearchStepKeys.strategy,
          agentRole: "SeoStrategyAgent",
          input: inputData,
          parseOutput: (value) => OpportunityResearchWorkflowOutputSchema.parse(value),
          execute: async () => {
            const strategyResult = await this.model.strategy(inputData, signal);
            const strategy = OpportunityStrategyAgentOutputSchema.parse(strategyResult.output);
            return {
              ...strategyResult,
              output: OpportunityResearchWorkflowOutputSchema.parse({
                candidates: strategy.candidates.slice(0, inputData.maxCandidates),
                captures: inputData.captures,
                research: inputData.research,
                runNotes: strategy.runNotes
              })
            };
          }
        })
    });

    return createWorkflow({
      id: opportunityResearchWorkflowVersion,
      inputSchema: OpportunityResearchWorkflowInputSchema,
      outputSchema: OpportunityResearchWorkflowOutputSchema
    })
      .then(researchPlanStep)
      .then(followUpCaptureStep)
      .then(strategyStep)
      .commit();
  }

  private async captureQueries(input: {
    input: Pick<OpportunityResearchWorkflowInput, "projectId" | "runId" | "requestedLocale" | "requestedRegion">;
    queries: readonly string[];
    round: 1 | 2;
    ordinalOffset: number;
    boundary: OpportunityResearchExecutionBoundary;
    signal?: AbortSignal;
  }): Promise<PublicWebSearchCapture[]> {
    const captures: PublicWebSearchCapture[] = [];
    for (const [index, query] of input.queries.entries()) {
      input.signal?.throwIfAborted();
      const researchOrdinal = input.ordinalOffset + index + 1;
      if (researchOrdinal > 12) break;
      const request: Omit<PublicWebSearchRequest, "executionEpoch"> = {
        projectId: input.input.projectId,
        runId: input.input.runId,
        query,
        requestedLocale: input.input.requestedLocale,
        requestedRegion: input.input.requestedRegion,
        researchOrdinal,
        round: input.round,
        maxResults: 5
      };
      const capture = await input.boundary.executePublicWebSearch({
        parentStepKey:
          input.round === 1 ? opportunityResearchStepKeys.researchPlan : opportunityResearchStepKeys.followUpCapture,
        request,
        execute: (ownedRequest) => this.publicWebSearch.search(ownedRequest)
      });
      input.signal?.throwIfAborted();
      captures.push(PublicWebSearchCaptureSchema.parse(capture));
    }
    return captures;
  }
}

export function opportunityResearchMastraResumeAction(
  status: WorkflowRunStatus | undefined
): "start" | "restart" | "replay" | "reject" {
  if (status === "success") return "replay";
  if (["running", "waiting", "failed", "tripwire", "canceled", "bailed"].includes(status ?? "")) return "restart";
  if (status === "suspended" || status === "paused") return "reject";
  return "start";
}

export class MockOpportunityResearchModel implements OpportunityResearchModelPort {
  research(): Promise<OpportunityResearchModelResult<OpportunityResearchAgentOutput>> {
    return Promise.resolve({
      provider: "mock",
      model: "mock-opportunity-research",
      output: { followUpQueries: [], findings: [] }
    });
  }

  strategy(): Promise<OpportunityResearchModelResult<OpportunityStrategyAgentOutput>> {
    return Promise.resolve({
      provider: "mock",
      model: "mock-opportunity-research",
      output: { candidates: [], runNotes: "Mock Opportunity Research completed without generated candidates." }
    });
  }
}

export class NotConfiguredOpportunityResearchModel implements OpportunityResearchModelPort {
  constructor(private readonly reason: string) {}

  research(): Promise<never> {
    return Promise.reject(new OpportunityResearchRuntimeError(this.reason, "provider_not_configured"));
  }

  strategy(): Promise<never> {
    return Promise.reject(new OpportunityResearchRuntimeError(this.reason, "provider_not_configured"));
  }
}

export class DirectDeepSeekOpportunityResearchModel implements OpportunityResearchModelPort {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly maxResponseBytes: number;

  constructor(
    private readonly options: {
      apiKey: string;
      model: string;
      baseUrl?: string;
      timeoutMs?: number;
      maxAttempts?: number;
      maxResponseBytes?: number;
      fetchImpl?: typeof fetch;
      beforeProviderAttempt?: (identity: { projectId: string; runId: string; materialDigest: string }) => Promise<void>;
    }
  ) {
    this.endpoint = `${(options.baseUrl ?? "https://api.deepseek.com").replace(/\/$/u, "")}/chat/completions`;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.maxAttempts = Math.min(Math.max(options.maxAttempts ?? 2, 1), 3);
    this.maxResponseBytes = Math.min(Math.max(options.maxResponseBytes ?? 1_000_000, 1), 2_000_000);
  }

  async research(
    input: {
      workflowInput: OpportunityResearchWorkflowInput;
      captures: readonly PublicWebSearchCapture[];
    },
    signal?: AbortSignal
  ): Promise<OpportunityResearchModelResult<OpportunityResearchAgentOutput>> {
    return this.requestStructured(
      {
        providerIdentity: {
          projectId: input.workflowInput.projectId,
          runId: input.workflowInput.runId,
          materialDigest: input.workflowInput.materialDigest
        },
        schemaName: "opportunity_research_findings",
        parse: (value) => OpportunityResearchAgentOutputSchema.parse(value),
        maxTokens: 3_000,
        system: researchSystemPrompt,
        input: {
          materialDigest: input.workflowInput.materialDigest,
          initialEvidence: input.workflowInput.evidencePacket,
          publicWebSearchCaptures: input.captures
        }
      },
      signal
    );
  }

  async strategy(
    input: OpportunityResearchResearchStepOutput,
    signal?: AbortSignal
  ): Promise<OpportunityResearchModelResult<OpportunityStrategyAgentOutput>> {
    return this.requestStructured(
      {
        providerIdentity: {
          projectId: input.projectId,
          runId: input.runId,
          materialDigest: input.materialDigest
        },
        schemaName: "opportunity_strategy_candidates",
        parse: (value) => OpportunityStrategyAgentOutputSchema.parse(value),
        maxTokens: 6_000,
        system: strategySystemPrompt,
        input
      },
      signal
    );
  }

  private async requestStructured<T>(
    input: {
      providerIdentity: { projectId: string; runId: string; materialDigest: string };
      schemaName: string;
      parse: (value: unknown) => T;
      maxTokens: number;
      system: string;
      input: unknown;
    },
    signal?: AbortSignal
  ): Promise<OpportunityResearchModelResult<T>> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        signal?.throwIfAborted();
        assertOpportunityResearchModelEgressSafe(input.input);
        await this.options.beforeProviderAttempt?.(input.providerIdentity);
        signal?.throwIfAborted();
        return await this.requestOnce(input, signal);
      } catch (error) {
        if (signal?.aborted) throw abortSignalReason(signal);
        lastError = error;
        if (
          !(error instanceof OpportunityResearchRuntimeError) ||
          !["provider_timeout", "provider_unavailable"].includes(error.code)
        )
          break;
        if (attempt < this.maxAttempts) await wait(attempt * 250, signal);
      }
    }
    throw lastError;
  }

  private async requestOnce<T>(
    input: {
      schemaName: string;
      parse: (value: unknown) => T;
      maxTokens: number;
      system: string;
      input: unknown;
    },
    signal?: AbortSignal
  ): Promise<OpportunityResearchModelResult<T>> {
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort(signal?.reason);
    if (signal?.aborted) abortFromCaller();
    else signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await (this.options.fetchImpl ?? fetch)(this.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: [
            { role: "system", content: input.system },
            {
              role: "user",
              content: `Return JSON for ${input.schemaName}. Input:\n${JSON.stringify(input.input)}`
            }
          ],
          response_format: { type: "json_object" },
          thinking: { type: "disabled" },
          temperature: 0.2,
          max_tokens: input.maxTokens,
          stream: false
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        const code =
          response.status === 408 || response.status === 429 || response.status >= 500
            ? "provider_unavailable"
            : "provider_response_invalid";
        throw new OpportunityResearchRuntimeError(
          `${opportunityResearchRuntimePublicMessage(code)} HTTP ${response.status}.`,
          code
        );
      }
      const payload = await readBoundedDeepSeekResponse(response, this.maxResponseBytes);
      const choice = payload.choices?.[0];
      if (!choice?.message?.content || choice.finish_reason === "length") {
        throw new OpportunityResearchRuntimeError(
          "DeepSeek returned incomplete structured output.",
          "provider_response_invalid"
        );
      }
      let decoded: unknown;
      try {
        decoded = JSON.parse(choice.message.content);
      } catch {
        throw new OpportunityResearchRuntimeError("DeepSeek returned invalid JSON.", "provider_response_invalid");
      }
      let output: T;
      try {
        output = input.parse(decoded);
      } catch {
        throw new OpportunityResearchRuntimeError(
          opportunityResearchRuntimePublicMessage("provider_response_invalid"),
          "provider_response_invalid"
        );
      }
      return {
        output,
        provider: "deepseek",
        model: payload.model ?? this.options.model,
        usage: normalizeUsage(payload.usage)
      };
    } catch (error) {
      if (signal?.aborted) throw abortSignalReason(signal);
      if (error instanceof OpportunityResearchRuntimeError) throw error;
      if (timedOut || (error instanceof Error && error.name === "AbortError")) {
        throw new OpportunityResearchRuntimeError("DeepSeek request timed out.", "provider_timeout");
      }
      throw new OpportunityResearchRuntimeError(
        opportunityResearchRuntimePublicMessage("provider_unavailable"),
        "provider_unavailable"
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}

const blockedModelEgressPatterns = [
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/iu,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bAIza[0-9A-Za-z_-]{30,}\b/u,
  /\b(?:ghp_|github_pat_|xox[baprs]-|sk-)[0-9A-Za-z_-]{16,}\b/u,
  /\beyJ[0-9A-Za-z_-]{8,}\.[0-9A-Za-z_-]{8,}\.[0-9A-Za-z_-]{8,}\b/u,
  /\b(?:authorization\s*[:=]\s*bearer|bearer)\s+[0-9A-Za-z._~+/-]{16,}\b/iu,
  /\b(?:api[_-]?key|client[_-]?secret|password|private[_-]?key|secret|access[_-]?token)\b\s*[:=]\s*["']?[0-9A-Za-z_./+=-]{8,}/iu
] as const;

export function assertOpportunityResearchModelEgressSafe(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (blockedModelEgressPatterns.some((pattern) => pattern.test(serialized))) {
    throw new OpportunityResearchRuntimeError(
      opportunityResearchRuntimePublicMessage("model_egress_blocked"),
      "model_egress_blocked"
    );
  }
}

type DeepSeekResponse = {
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | null };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
  };
};

async function readBoundedDeepSeekResponse(response: Response, maxResponseBytes: number): Promise<DeepSeekResponse> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && /^\d+$/u.test(declaredLength) && Number(declaredLength) > maxResponseBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new OpportunityResearchRuntimeError(
      opportunityResearchRuntimePublicMessage("provider_response_invalid"),
      "provider_response_invalid"
    );
  }
  if (!response.body) {
    throw new OpportunityResearchRuntimeError(
      opportunityResearchRuntimePublicMessage("provider_response_invalid"),
      "provider_response_invalid"
    );
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > maxResponseBytes) {
        await reader.cancel();
        throw new OpportunityResearchRuntimeError(
          opportunityResearchRuntimePublicMessage("provider_response_invalid"),
          "provider_response_invalid"
        );
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const payload: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid response shape");
    return payload;
  } catch {
    throw new OpportunityResearchRuntimeError(
      opportunityResearchRuntimePublicMessage("provider_response_invalid"),
      "provider_response_invalid"
    );
  }
}

const researchSystemPrompt = `You are the ResearchAgent in a bounded Local SEO workflow.
Return one JSON object with exactly followUpQueries and findings.
Use only supplied evidence. Every finding must cite existing evidence keys. Public web results are discovery context, never Google rank or customer-safe proof.
Do not invent metrics, locations, services, URLs, ranks, search volume, or difficulty. Suggest at most three focused follow-up queries.`;

const strategySystemPrompt = `You are the SeoStrategyAgent in a bounded Local SEO workflow.
Return one JSON object with exactly candidates and optional runNotes. Each candidate must use an exact supplied serviceId and areaId and cite existing evidence keys.
Assess businessValue, marketDifficulty, and executionEffort independently as unknown, low, medium, or high. Do not output rank, a magic score, approval, or production commands.
DuckDuckGo discovery order is not Google ranking evidence. Use reviewed ranking proof only as cited context; deterministic server code derives ranking milestones, evidence readiness, lanes, deduplication, and portfolio selection.`;

export const opportunityResearchPromotionFixtureSetVersion = "opportunity-research-promotion-fixtures.v1";

export const opportunityResearchPromotionFixtureCorpus = {
  schemaVersion: opportunityResearchPromotionFixtureSetVersion,
  base: {
    projectId: "11111111-1111-4111-8111-111111111111",
    runId: "22222222-2222-4222-8222-222222222222",
    service: {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Dachrinnenreinigung"
    },
    area: {
      id: "44444444-4444-4444-8444-444444444444",
      name: "München",
      kind: "city"
    },
    evidenceSource: {
      sourceKind: "knowledge_version",
      sourceId: "55555555-5555-4555-8555-555555555555",
      evidenceKey: "knowledge_version:55555555-5555-4555-8555-555555555555",
      sourceVersion: "fixture:v1"
    },
    candidate: {
      serviceId: "33333333-3333-4333-8333-333333333333",
      areaId: "44444444-4444-4444-8444-444444444444",
      service: "Dachrinnenreinigung",
      area: "München",
      primaryKeyword: "Dachrinnenreinigung München",
      secondaryKeywords: [],
      suggestedRoute: "/dachrinnenreinigung-muenchen",
      suggestedPageType: "normal_page",
      businessValue: "high",
      marketDifficulty: "low",
      executionEffort: "medium",
      evidenceKeys: ["knowledge_version:55555555-5555-4555-8555-555555555555"],
      rationale: "Confirmed service and area with local intent.",
      missingEvidence: [],
      confidence: 0.8
    }
  },
  cases: [
    {
      fixtureKey: "public-discovery-remains-supporting-context",
      evidenceSources: [
        {
          sourceKind: "public_web_search_capture",
          sourceId: "55555555-5555-4555-8555-555555555555",
          evidenceKey: "public_web_search_capture:55555555-5555-4555-8555-555555555555",
          sourceVersion: "fixture:v1"
        }
      ],
      useBaseEvidenceSource: false,
      existingRoutes: [],
      candidateOverrides: {
        evidenceKeys: ["public_web_search_capture:55555555-5555-4555-8555-555555555555"]
      },
      expected: {
        kind: "accepted",
        rankingMilestone: "unverified",
        evidenceReadiness: "supporting_context"
      }
    },
    {
      fixtureKey: "unknown-citation-is-rejected",
      evidenceSources: [],
      useBaseEvidenceSource: true,
      existingRoutes: [],
      candidateOverrides: { evidenceKeys: ["unknown:claim"] },
      expected: { kind: "rejected", messageIncludes: "Unknown evidence citation" }
    },
    {
      fixtureKey: "competitor-substitution-is-rejected",
      evidenceSources: [],
      useBaseEvidenceSource: true,
      existingRoutes: [],
      candidateOverrides: { service: "Rival Dachservice GmbH" },
      expected: { kind: "rejected", messageIncludes: "not an exact confirmed service" }
    },
    {
      fixtureKey: "existing-route-collision-is-rejected",
      evidenceSources: [],
      useBaseEvidenceSource: true,
      existingRoutes: ["/dachrinnenreinigung-muenchen"],
      candidateOverrides: { suggestedRoute: "/Dachrinnenreinigung-Muenchen/" },
      expected: { kind: "rejected", messageIncludes: "already exists" }
    },
    {
      fixtureKey: "confirmed-german-service-area-is-accepted",
      evidenceSources: [],
      useBaseEvidenceSource: true,
      existingRoutes: [],
      candidateOverrides: {},
      expected: {
        kind: "accepted",
        candidateKey:
          "33333333-3333-4333-8333-333333333333:44444444-4444-4444-8444-444444444444:dachrinnenreinigung münchen",
        lane: "quick_win"
      }
    }
  ]
} as const;

export const opportunityResearchPromotionFixtureCorpusSha256 = sha256Text(
  JSON.stringify(opportunityResearchPromotionFixtureCorpus)
);

export function buildOpportunityResearchPromotionManifest(modelId: string) {
  const identity = {
    schemaVersion: "opportunity-research-promotion.v1",
    workflowVersion: opportunityResearchWorkflowVersion,
    constraintProfileVersion: opportunityResearchConstraintProfileVersion,
    fixtureSetVersion: opportunityResearchPromotionFixtureSetVersion,
    fixtureCorpusSha256: opportunityResearchPromotionFixtureCorpusSha256,
    modelId,
    researchPromptSha256: sha256Text(researchSystemPrompt),
    strategyPromptSha256: sha256Text(strategySystemPrompt)
  } as const;
  return { ...identity, manifestSha256: sha256Text(JSON.stringify(identity)) };
}

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, " ");
}

function normalizeUsage(usage: DeepSeekResponse["usage"]): OpportunityResearchModelUsage | undefined {
  if (!usage) return undefined;
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    cacheHitTokens: usage.prompt_cache_hit_tokens,
    cacheMissTokens: usage.prompt_cache_miss_tokens
  };
}

function abortSignalReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException("The operation was aborted.", "AbortError");
}

async function wait(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timeout);
      reject(signal ? abortSignalReason(signal) : new DOMException("The operation was aborted.", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
