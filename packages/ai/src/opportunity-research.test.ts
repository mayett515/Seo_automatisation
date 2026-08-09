import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  buildPublicWebSearchCaptureEvidenceKey,
  type OpportunityResearchAgentOutput,
  type OpportunityResearchResearchStepOutput,
  type OpportunityStrategyAgentOutput,
  type PublicWebSearchCapture
} from "@localseo/contracts";
import {
  DirectDeepSeekOpportunityResearchModel,
  MastraOpportunityResearchAdapter,
  OpportunityResearchRuntimeError,
  buildOpportunityResearchPromotionManifest,
  opportunityResearchMastraSchemaName,
  opportunityResearchPromotionFixtureCorpus,
  opportunityResearchPromotionFixtureCorpusSha256,
  type OpportunityResearchExecutionBoundary,
  type OpportunityResearchModelPort,
  opportunityResearchMastraResumeAction,
  opportunityResearchStepKeys
} from "./opportunity-research.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const serviceId = "33333333-3333-4333-8333-333333333333";
const areaId = "44444444-4444-4444-8444-444444444444";

void describe("MastraOpportunityResearchAdapter", () => {
  void it("runs typed research and strategy steps with two bounded search rounds", async () => {
    const calls: string[] = [];
    const ordinals: number[] = [];
    const model: OpportunityResearchModelPort = {
      research(input): Promise<{ output: OpportunityResearchAgentOutput; provider: string; model: string }> {
        assert.equal(input.captures.length, 1);
        const firstCapture = input.captures[0];
        assert.ok(firstCapture);
        assert.equal(firstCapture.evidenceKey, buildPublicWebSearchCaptureEvidenceKey(firstCapture.id));
        return Promise.resolve({
          provider: "test",
          model: "test-model",
          output: {
            followUpQueries: ["Folgefrage Berlin", "Gebaeudereinigung Berlin"],
            findings: [
              {
                findingKey: "finding-1",
                summary: "A bounded finding.",
                evidenceKeys: [`canonical_service:${serviceId}`]
              }
            ]
          }
        });
      },
      strategy(
        input: OpportunityResearchResearchStepOutput
      ): Promise<{ output: OpportunityStrategyAgentOutput; provider: string; model: string }> {
        assert.equal(input.captures.length, 2);
        assert.ok(
          input.captures.every((capture) => capture.evidenceKey === buildPublicWebSearchCaptureEvidenceKey(capture.id))
        );
        return Promise.resolve({
          provider: "test",
          model: "test-model",
          output: {
            candidates: [
              {
                serviceId,
                areaId,
                service: "Gebaeudereinigung",
                area: "Berlin",
                primaryKeyword: "Gebaeudereinigung Berlin",
                secondaryKeywords: [],
                suggestedPageType: "normal_page",
                businessValue: "high",
                marketDifficulty: "medium",
                executionEffort: "medium",
                evidenceKeys: [`canonical_service:${serviceId}`],
                rationale: "A bounded proposal.",
                missingEvidence: [],
                confidence: 0.7
              }
            ]
          }
        });
      }
    };
    const adapter = new MastraOpportunityResearchAdapter(model, {
      search(request) {
        ordinals.push(request.researchOrdinal);
        return Promise.resolve(captureFor(request.researchOrdinal, request.round, request.query));
      }
    });
    const boundary: OpportunityResearchExecutionBoundary = {
      async executeAgentStep(definition) {
        calls.push(definition.stepKey);
        const result = await definition.execute();
        return definition.parseOutput(result.output);
      },
      async executeToolStep(definition) {
        calls.push(definition.stepKey);
        return definition.parseOutput(await definition.execute());
      },
      async executePublicWebSearch(input) {
        return input.execute({ ...input.request, executionEpoch: 1 });
      }
    };
    const output = await adapter.run(
      {
        projectId,
        runId,
        materialDigest: "a".repeat(64),
        maxCandidates: 20,
        initialQueries: ["Gebaeudereinigung Berlin"],
        requestedLocale: "de-DE",
        evidencePacket: {
          services: [{ id: serviceId, name: "Gebaeudereinigung" }],
          areas: [{ id: areaId, name: "Berlin" }]
        }
      },
      boundary
    );
    assert.deepEqual(calls, [
      opportunityResearchStepKeys.researchPlan,
      opportunityResearchStepKeys.followUpCapture,
      opportunityResearchStepKeys.strategy
    ]);
    assert.deepEqual(ordinals, [1, 2]);
    assert.equal(output.candidates.length, 1);
    assert.equal(output.captures.length, 2);
  });

  void it("replays the persisted follow-up plan instead of accepting a changed model plan after a crash", async () => {
    let researchCalls = 0;
    let crashAfterCapturedPlan = true;
    let storedPlan: unknown;
    const followUpQueries: string[] = [];
    const captures = new Map<number, PublicWebSearchCapture>();
    const model: OpportunityResearchModelPort = {
      research() {
        researchCalls += 1;
        return Promise.resolve({
          provider: "test",
          model: "test-model",
          output: {
            followUpQueries: [researchCalls === 1 ? "Persisted follow-up" : "Changed follow-up"],
            findings: []
          }
        });
      },
      strategy() {
        return Promise.resolve({
          provider: "test",
          model: "test-model",
          output: { candidates: [], runNotes: "Replay test." }
        });
      }
    };
    const adapter = new MastraOpportunityResearchAdapter(model, {
      search(request) {
        const existing = captures.get(request.researchOrdinal);
        if (existing) {
          assert.equal(existing.query, request.query);
          return Promise.resolve(existing);
        }
        if (request.round === 2) followUpQueries.push(request.query);
        const capture = captureFor(request.researchOrdinal, request.round, request.query);
        captures.set(request.researchOrdinal, capture);
        return Promise.resolve(capture);
      }
    });
    const boundary: OpportunityResearchExecutionBoundary = {
      async executeAgentStep(definition) {
        if (definition.stepKey === opportunityResearchStepKeys.researchPlan && storedPlan) {
          return definition.parseOutput(storedPlan);
        }
        const result = await definition.execute();
        if (definition.stepKey === opportunityResearchStepKeys.researchPlan) storedPlan = result.output;
        return definition.parseOutput(result.output);
      },
      async executeToolStep(definition) {
        const output = await definition.execute();
        if (crashAfterCapturedPlan) {
          crashAfterCapturedPlan = false;
          throw new Error("Simulated process crash after durable follow-up capture.");
        }
        return definition.parseOutput(output);
      },
      async executePublicWebSearch(input) {
        return input.execute({ ...input.request, executionEpoch: 1 });
      }
    };
    const input = {
      projectId,
      runId,
      materialDigest: "d".repeat(64),
      maxCandidates: 20,
      initialQueries: ["Initial query"],
      requestedLocale: "de-DE",
      evidencePacket: {}
    };

    await assert.rejects(() => adapter.run(input, boundary), /workflow failed/iu);
    const output = await adapter.run(input, boundary);

    assert.equal(researchCalls, 1);
    assert.deepEqual(followUpQueries, ["Persisted follow-up"]);
    assert.equal(output.captures.length, 2);
  });
});

void describe("DirectDeepSeekOpportunityResearchModel", () => {
  void it("uses the configured V4 model and parses contract-bound JSON output", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const model = new DirectDeepSeekOpportunityResearchModel({
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      maxAttempts: 1,
      fetchImpl: (_url, init) => {
        if (typeof init?.body !== "string") throw new Error("Expected a JSON request body.");
        requestBody = JSON.parse(init.body) as Record<string, unknown>;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              model: "deepseek-v4-flash",
              choices: [
                { finish_reason: "stop", message: { content: JSON.stringify({ followUpQueries: [], findings: [] }) } }
              ],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        );
      }
    });
    const result = await model.research({
      workflowInput: {
        projectId,
        runId,
        materialDigest: "b".repeat(64),
        maxCandidates: 20,
        initialQueries: ["test"],
        requestedLocale: "de-DE",
        evidencePacket: {}
      },
      captures: []
    });
    assert.equal(requestBody?.model, "deepseek-v4-flash");
    assert.deepEqual(requestBody?.response_format, { type: "json_object" });
    assert.deepEqual(result.output, { followUpQueries: [], findings: [] });
    assert.equal(result.usage?.totalTokens, 15);
  });

  void it("revalidates current material before every provider retry", async () => {
    let providerAttempts = 0;
    let guardCalls = 0;
    const model = new DirectDeepSeekOpportunityResearchModel({
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      maxAttempts: 2,
      beforeProviderAttempt(identity) {
        guardCalls += 1;
        assert.deepEqual(identity, { projectId, runId, materialDigest: "e".repeat(64) });
        return Promise.resolve();
      },
      fetchImpl() {
        providerAttempts += 1;
        if (providerAttempts === 1) return Promise.resolve(new Response("retry", { status: 503 }));
        return Promise.resolve(
          new Response(
            JSON.stringify({
              model: "deepseek-v4-flash",
              choices: [
                { finish_reason: "stop", message: { content: JSON.stringify({ followUpQueries: [], findings: [] }) } }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        );
      }
    });

    await model.research({
      workflowInput: {
        projectId,
        runId,
        materialDigest: "e".repeat(64),
        maxCandidates: 20,
        initialQueries: ["test"],
        requestedLocale: "de-DE",
        evidencePacket: {}
      },
      captures: []
    });
    assert.equal(providerAttempts, 2);
    assert.equal(guardCalls, 2);
  });

  void it("does not disclose provider response bodies through runtime errors", async () => {
    const model = new DirectDeepSeekOpportunityResearchModel({
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      maxAttempts: 1,
      fetchImpl: () => Promise.resolve(new Response("provider-secret-token", { status: 503 }))
    });

    await assert.rejects(
      () =>
        model.research({
          workflowInput: {
            projectId,
            runId,
            materialDigest: "c".repeat(64),
            maxCandidates: 20,
            initialQueries: ["test"],
            requestedLocale: "de-DE",
            evidencePacket: {}
          },
          captures: []
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.doesNotMatch(error.message, /provider-secret-token/u);
        assert.match(error.message, /provider is unavailable/u);
        return true;
      }
    );
  });

  void it("rejects an oversized provider response before decoding structured output", async () => {
    const model = new DirectDeepSeekOpportunityResearchModel({
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      maxAttempts: 1,
      maxResponseBytes: 64,
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [{ finish_reason: "stop", message: { content: "x".repeat(256) } }]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        )
    });

    await assert.rejects(
      () =>
        model.research({
          workflowInput: {
            projectId,
            runId,
            materialDigest: "f".repeat(64),
            maxCandidates: 20,
            initialQueries: ["test"],
            requestedLocale: "de-DE",
            evidencePacket: {}
          },
          captures: []
        }),
      (error: unknown) => {
        assert.ok(error instanceof OpportunityResearchRuntimeError);
        assert.equal(error.code, "provider_response_invalid");
        return true;
      }
    );
  });

  void it("aborts an in-flight provider request without retrying after execution ownership is lost", async () => {
    let providerAttempts = 0;
    const controller = new AbortController();
    const model = new DirectDeepSeekOpportunityResearchModel({
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      maxAttempts: 3,
      fetchImpl: (_url, init) => {
        providerAttempts += 1;
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) return reject(new Error("Expected a provider abort signal."));
          const abort = () =>
            reject(
              signal.reason instanceof Error
                ? signal.reason
                : new DOMException("The operation was aborted.", "AbortError")
            );
          if (signal.aborted) abort();
          else signal.addEventListener("abort", abort, { once: true });
        });
      }
    });
    const pending = model.research(
      {
        workflowInput: {
          projectId,
          runId,
          materialDigest: "1".repeat(64),
          maxCandidates: 20,
          initialQueries: ["test"],
          requestedLocale: "de-DE",
          evidencePacket: {}
        },
        captures: []
      },
      controller.signal
    );

    await Promise.resolve();
    controller.abort(new Error("execution lease lost"));

    await assert.rejects(() => pending, /execution lease lost/u);
    assert.equal(providerAttempts, 1);
  });

  void it("blocks obvious secret-like material before any model request", async () => {
    let fetchCalls = 0;
    const model = new DirectDeepSeekOpportunityResearchModel({
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      maxAttempts: 3,
      fetchImpl: () => {
        fetchCalls += 1;
        return Promise.resolve(new Response("{}", { status: 200 }));
      }
    });

    await assert.rejects(
      () =>
        model.research({
          workflowInput: {
            projectId,
            runId,
            materialDigest: "d".repeat(64),
            maxCandidates: 20,
            initialQueries: ["test"],
            requestedLocale: "de-DE",
            evidencePacket: { knowledge: [{ bodyMarkdown: "api_key = super-secret-value-12345" }] }
          },
          captures: []
        }),
      (error: unknown) => {
        assert.ok(error instanceof OpportunityResearchRuntimeError);
        assert.equal(error.code, "model_egress_blocked");
        return true;
      }
    );
    assert.equal(fetchCalls, 0);
  });
});

void describe("opportunityResearchMastraResumeAction", () => {
  void it("starts only absent or pending snapshots, restarts retryable snapshots, replays success, and rejects suspension", () => {
    assert.equal(opportunityResearchMastraResumeAction(undefined), "start");
    assert.equal(opportunityResearchMastraResumeAction("pending"), "start");
    assert.equal(opportunityResearchMastraResumeAction("failed"), "restart");
    assert.equal(opportunityResearchMastraResumeAction("running"), "restart");
    assert.equal(opportunityResearchMastraResumeAction("waiting"), "restart");
    assert.equal(opportunityResearchMastraResumeAction("tripwire"), "restart");
    assert.equal(opportunityResearchMastraResumeAction("canceled"), "restart");
    assert.equal(opportunityResearchMastraResumeAction("bailed"), "restart");
    assert.equal(opportunityResearchMastraResumeAction("success"), "replay");
    assert.equal(opportunityResearchMastraResumeAction("suspended"), "reject");
    assert.equal(opportunityResearchMastraResumeAction("paused"), "reject");
  });
});

void describe("Opportunity Research promotion manifest", () => {
  void it("binds model promotion to workflow, policy, prompts, fixtures, and model id", () => {
    const first = buildOpportunityResearchPromotionManifest("deepseek-v4-flash");
    const replay = buildOpportunityResearchPromotionManifest("deepseek-v4-flash");
    const changedModel = buildOpportunityResearchPromotionManifest("deepseek-v4-flash-next");
    assert.deepEqual(replay, first);
    assert.match(first.researchPromptSha256, /^[0-9a-f]{64}$/u);
    assert.match(first.strategyPromptSha256, /^[0-9a-f]{64}$/u);
    assert.equal(first.fixtureCorpusSha256, opportunityResearchPromotionFixtureCorpusSha256);
    assert.equal(
      opportunityResearchPromotionFixtureCorpusSha256,
      createHash("sha256").update(JSON.stringify(opportunityResearchPromotionFixtureCorpus), "utf8").digest("hex")
    );
    assert.match(first.manifestSha256, /^[0-9a-f]{64}$/u);
    assert.notEqual(changedModel.manifestSha256, first.manifestSha256);
    assert.equal(opportunityResearchMastraSchemaName, "mastra_workflows");
  });
});

function captureFor(ordinal: number, round: number, query: string): PublicWebSearchCapture {
  const id = `${String(ordinal).padStart(8, "0")}-0000-4000-8000-000000000000`;
  return {
    id,
    projectId,
    runId,
    executionEpoch: 1,
    query,
    provider: "duckduckgo_html",
    requestedLocale: "de-DE",
    maxResults: 5,
    effectiveLocale: "de-de",
    researchOrdinal: ordinal,
    round,
    status: "succeeded",
    results: [],
    evidencePolicy: "research_support_only",
    evidenceKey: buildPublicWebSearchCaptureEvidenceKey(id),
    capturedAt: "2026-08-09T10:00:00.000Z"
  };
}
