import type { AiReasoningPort, AiReasoningRunInput, AiReasoningRunResult, AiReasoningUsage } from "./index.js";
import {
  isProviderRequestError,
  providerReasonCodeFromResponseText,
  runProviderRequestWithTimeout
} from "./provider-errors.js";

export type OpenCodeGoReasoningAdapterOptions = {
  apiKey: string;
  model: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
};

type ChatCompletionMessage = {
  role?: unknown;
  content?: unknown;
};

type ChatCompletionChoice = {
  message?: ChatCompletionMessage;
  finish_reason?: unknown;
};

type ChatCompletionUsage = {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  total_tokens?: unknown;
  cost_cents?: unknown;
};

type ChatCompletionResponse = {
  model?: unknown;
  choices?: unknown;
  usage?: unknown;
};

const defaultOpenCodeGoEndpoint = "https://opencode.ai/zen/go/v1/chat/completions";

export class OpenCodeGoReasoningAdapter implements AiReasoningPort {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenCodeGoReasoningAdapterOptions) {
    this.endpoint = options.endpoint ?? defaultOpenCodeGoEndpoint;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async runStructured(input: AiReasoningRunInput): Promise<AiReasoningRunResult> {
    const startedAt = Date.now();

    try {
      const response = await runProviderRequestWithTimeout(
        {
          provider: "opencode_go",
          operation: "chat_completions",
          timeoutMs: input.timeoutMs
        },
        (signal) =>
          this.fetchImpl(this.endpoint, {
            method: "POST",
            signal,
            headers: {
              authorization: `Bearer ${this.options.apiKey}`,
              "content-type": "application/json"
            },
            body: JSON.stringify({
              model: this.options.model,
              response_format: { type: "json_object" },
              messages: [
                {
                  role: "system",
                  content:
                    "Return only JSON that matches the requested output schema. Do not include Markdown or prose."
                },
                {
                  role: "user",
                  content: JSON.stringify({
                    task: input.task,
                    outputSchemaName: input.outputSchemaName,
                    policy: input.policy,
                    prompt: input.prompt,
                    inputJson: input.inputJson
                  })
                }
              ]
            })
          })
      );

      if (!response.ok) {
        return failureFromResponse(response, startedAt, await response.text());
      }

      const completion = await parseCompletionResponse(response, startedAt);
      if (!completion.ok) {
        return completion;
      }

      const content = firstChoiceContent(completion.value);
      if (!content) {
        return {
          ok: false,
          failureCode: "output_not_json",
          provider: "opencode_go",
          model: this.options.model,
          diagnostics: {
            latencyMs: elapsedMs(startedAt),
            detail: "missing_content"
          }
        };
      }

      const outputJson = parseJsonContent(content);
      if (!outputJson.ok) {
        return {
          ok: false,
          failureCode: "output_not_json",
          provider: "opencode_go",
          model: modelName(completion.value, this.options.model),
          diagnostics: {
            latencyMs: elapsedMs(startedAt),
            detail: "invalid_json_content"
          }
        };
      }

      return {
        ok: true,
        provider: "opencode_go",
        model: modelName(completion.value, this.options.model),
        outputJson: outputJson.value,
        usage: usageFromCompletion(completion.value),
        diagnostics: {
          latencyMs: elapsedMs(startedAt),
          finishReason: firstChoiceFinishReason(completion.value)
        }
      };
    } catch (error) {
      if (isTimeoutProviderError(error)) {
        return {
          ok: false,
          failureCode: "provider_timeout",
          provider: "opencode_go",
          model: this.options.model,
          diagnostics: {
            latencyMs: elapsedMs(startedAt),
            detail: "timeout"
          }
        };
      }

      return {
        ok: false,
        failureCode: "provider_error",
        provider: "opencode_go",
        model: this.options.model,
        diagnostics: {
          latencyMs: elapsedMs(startedAt),
          detail: requestFailureDetail(error)
        }
      };
    }
  }
}

function failureFromResponse(response: Response, startedAt: number, body: string): AiReasoningRunResult {
  return {
    ok: false,
    failureCode: response.status === 429 || response.status === 503 ? "provider_overloaded" : "provider_error",
    provider: "opencode_go",
    diagnostics: {
      latencyMs: elapsedMs(startedAt),
      detail: providerReasonCodeFromResponseText(body) ?? `http_${response.status}`
    }
  };
}

async function parseCompletionResponse(
  response: Response,
  startedAt: number
): Promise<
  | { ok: true; value: ChatCompletionResponse }
  | {
      ok: false;
      failureCode: "output_not_json";
      provider: "opencode_go";
      diagnostics: { latencyMs: number; detail: string };
    }
> {
  try {
    const parsed = (await response.json()) as unknown;
    return { ok: true, value: recordFromUnknown(parsed) };
  } catch {
    return {
      ok: false,
      failureCode: "output_not_json",
      provider: "opencode_go",
      diagnostics: {
        latencyMs: elapsedMs(startedAt),
        detail: "invalid_completion_json"
      }
    };
  }
}

function firstChoiceContent(completion: ChatCompletionResponse): string | undefined {
  const choices = Array.isArray(completion.choices) ? completion.choices : [];
  const first = recordFromUnknown(choices[0]) as ChatCompletionChoice;
  const message = recordFromUnknown(first.message);

  if (typeof message.content === "string") {
    return message.content;
  }

  return undefined;
}

function firstChoiceFinishReason(completion: ChatCompletionResponse): string | undefined {
  const choices = Array.isArray(completion.choices) ? completion.choices : [];
  const first = recordFromUnknown(choices[0]) as ChatCompletionChoice;

  return typeof first.finish_reason === "string" ? first.finish_reason : undefined;
}

function parseJsonContent(content: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(content) as unknown };
  } catch {
    return { ok: false };
  }
}

function usageFromCompletion(completion: ChatCompletionResponse): AiReasoningUsage {
  const usage = recordFromUnknown(completion.usage) as ChatCompletionUsage;
  const inputTokens = numberOrUndefined(usage.prompt_tokens);
  const outputTokens = numberOrUndefined(usage.completion_tokens);
  const costCents = numberOrUndefined(usage.cost_cents);

  return {
    inputTokens,
    outputTokens,
    costCents
  };
}

function modelName(completion: ChatCompletionResponse, fallback: string): string {
  return typeof completion.model === "string" && completion.model.length > 0 ? completion.model : fallback;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requestFailureDetail(error: unknown): string {
  const record = recordFromUnknown(error);
  const code = stringFromUnknown(record.code);
  if (code) {
    return providerReasonCodeFromResponseText(JSON.stringify({ error: code })) ?? "request_failed";
  }

  if (error instanceof Error && error.name.length > 0) {
    return providerReasonCodeFromResponseText(JSON.stringify({ error: error.name })) ?? "request_failed";
  }

  return "request_failed";
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function isTimeoutProviderError(error: unknown): boolean {
  return isProviderRequestError(error) && error.provider === "opencode_go" && error.reasonCode === "timeout";
}
