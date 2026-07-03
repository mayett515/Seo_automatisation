import type { AiReasoningPort, AiReasoningRunResult } from "./index.js";

export class NotConfiguredReasoningAdapter implements AiReasoningPort {
  constructor(private readonly detail = "ai_reasoning_provider_not_configured") {}

  runStructured(): Promise<AiReasoningRunResult> {
    return Promise.resolve({
      ok: false,
      failureCode: "provider_not_configured",
      provider: "not_configured",
      diagnostics: {
        latencyMs: 0,
        detail: this.detail
      }
    });
  }
}
