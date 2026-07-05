import type { SerpScoutRequest, SerpSnapshot } from "@localseo/contracts";
import type { SerpScoutPort, SerpScoutResult } from "./index.js";

export type MockSerpScoutAdapterResolver =
  | SerpScoutResult
  | ((
      input: SerpScoutRequest & { snapshotId?: string; timeoutMs: number; agentRunId?: string }
    ) => SerpScoutResult | Promise<SerpScoutResult>);

export class MockSerpScoutAdapter implements SerpScoutPort {
  readonly calls: Array<SerpScoutRequest & { snapshotId?: string; timeoutMs: number; agentRunId?: string }> = [];

  constructor(private readonly resolver: MockSerpScoutAdapterResolver = defaultMockSerpResult) {}

  search(
    input: SerpScoutRequest & { snapshotId?: string; timeoutMs: number; agentRunId?: string }
  ): Promise<SerpScoutResult> {
    this.calls.push(input);
    return Promise.resolve(typeof this.resolver === "function" ? this.resolver(input) : this.resolver);
  }
}

function defaultMockSerpResult(
  input: SerpScoutRequest & { snapshotId?: string; agentRunId?: string }
): SerpScoutResult {
  const capturedAt = new Date("2026-07-05T00:00:00.000Z").toISOString();
  const results: SerpSnapshot["results"] = [
    {
      rank: 1,
      type: "organic",
      title: `Mock result for ${input.query}`,
      url: "https://example.com/mock-serp-result",
      displayUrl: "example.com/mock-serp-result",
      domain: "example.com",
      snippet: "Deterministic mock SERP result for local worker tests."
    }
  ];
  const snapshot: SerpSnapshot = {
    id: input.snapshotId ?? "mock-serp-snapshot",
    projectId: input.projectId,
    agentRunId: input.agentRunId,
    status: "captured",
    query: input.query,
    searchEngine: input.searchEngine,
    device: input.device,
    locale: input.locale,
    region: input.region,
    cacheKey: buildMockSerpCacheKey(input),
    capturedAt,
    provider: "mock",
    results: results.slice(0, input.maxResults),
    serpFeatures: [],
    engineErrors: [],
    artifactRefs: []
  };

  return {
    ok: true,
    snapshot,
    diagnostics: {
      latencyMs: 0,
      detail: "mock"
    }
  };
}

function buildMockSerpCacheKey(input: SerpScoutRequest): string {
  return [
    input.searchEngine,
    input.device,
    input.locale ?? "default-locale",
    input.region ?? "default-region",
    input.query.trim().toLowerCase()
  ].join(":");
}
