import type { AiReasoningRunInput, AiReasoningRunResult, AiReasoningPort } from "./index.js";

export type MockReasoningAdapterResolver =
  | AiReasoningRunResult
  | ((input: AiReasoningRunInput) => AiReasoningRunResult | Promise<AiReasoningRunResult>);

export class MockReasoningAdapter implements AiReasoningPort {
  readonly calls: AiReasoningRunInput[] = [];

  constructor(private readonly resolver: MockReasoningAdapterResolver = defaultMockReasoningResult) {}

  async runStructured(input: AiReasoningRunInput): Promise<AiReasoningRunResult> {
    this.calls.push(input);
    return typeof this.resolver === "function" ? this.resolver(input) : this.resolver;
  }
}

const defaultMockReasoningResult: AiReasoningRunResult = {
  ok: true,
  provider: "mock",
  model: "mock-opportunity-scout",
  outputJson: {
    briefs: [],
    groups: []
  },
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    costCents: 0
  },
  diagnostics: {
    latencyMs: 0,
    finishReason: "mock"
  }
};
