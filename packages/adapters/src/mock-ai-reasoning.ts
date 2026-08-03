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

function defaultMockReasoningResult(input: AiReasoningRunInput): AiReasoningRunResult {
  if (input.task === "report_narrative") {
    const packet = asRecord(input.inputJson);
    const slots = Array.isArray(packet?.slots) ? packet.slots.map(asRecord).filter(Boolean) : [];
    return successfulMockResult("mock-report-narrative", {
      schemaVersion: "customer_report_narrative_draft.v1",
      fragments: slots.flatMap((slot, index) =>
        typeof slot?.slotKey === "string"
          ? [
              {
                slotKey: slot.slotKey,
                text:
                  slot.kind === "heading"
                    ? `Gepruefte Entwicklungen ${alphabeticSuffix(index)}`
                    : `Die geprueften Themen werden gemeinsam eingeordnet ${alphabeticSuffix(index)}`
              }
            ]
          : []
      )
    });
  }

  if (input.task === "section_text_generation") {
    const packet = asRecord(input.inputJson);
    const currentSection = asRecord(packet?.currentSection);
    const currentProps = asRecord(currentSection?.props);
    const allowedCopyFields = Array.isArray(packet?.allowedCopyFields)
      ? packet.allowedCopyFields.filter((value): value is string => typeof value === "string")
      : [];
    const field = allowedCopyFields.find((key) => typeof currentProps?.[key] === "string");

    if (typeof currentSection?.id === "string" && field) {
      const currentValue = currentProps?.[field];
      const suggestedValue =
        currentValue === "Lokale Leistungen auf den Punkt"
          ? "Lokale Leistungen klar erklaert"
          : "Lokale Leistungen auf den Punkt";
      return successfulMockResult("mock-section-copy", {
        schemaVersion: 1,
        sectionId: currentSection.id,
        suggestedFields: {
          [field]: suggestedValue
        }
      });
    }
  }

  return successfulMockResult("mock-opportunity-scout", {
    briefs: [],
    groups: []
  });
}

function alphabeticSuffix(index: number): string {
  const first = String.fromCharCode(65 + Math.floor(index / 26));
  const second = String.fromCharCode(65 + (index % 26));
  return `${first}${second}`;
}

function successfulMockResult(model: string, outputJson: unknown): AiReasoningRunResult {
  return {
    ok: true,
    provider: "mock",
    model,
    outputJson,
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
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
