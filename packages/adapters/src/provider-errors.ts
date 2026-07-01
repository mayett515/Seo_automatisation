export type ProviderName = "netlify" | "google_search_console";

export type ProviderErrorReasonCode = "http_error" | "invalid_json_response" | "invalid_provider_response" | "timeout";

export class ProviderRequestError extends Error {
  readonly provider: ProviderName;
  readonly operation: string;
  readonly reasonCode: ProviderErrorReasonCode;
  readonly statusCode?: number;
  readonly providerReasonCode?: string;

  constructor(input: {
    provider: ProviderName;
    operation: string;
    reasonCode: ProviderErrorReasonCode;
    statusCode?: number;
    providerReasonCode?: string;
  }) {
    const status = input.statusCode ? ` status=${input.statusCode}` : "";
    const providerReason = input.providerReasonCode ? ` provider_reason=${input.providerReasonCode}` : "";
    super(`${input.provider} ${input.operation} failed: ${input.reasonCode}${status}${providerReason}`);
    this.name = "ProviderRequestError";
    this.provider = input.provider;
    this.operation = input.operation;
    this.reasonCode = input.reasonCode;
    this.statusCode = input.statusCode;
    this.providerReasonCode = input.providerReasonCode;
  }
}

export function isProviderRequestError(error: unknown): error is ProviderRequestError {
  return error instanceof ProviderRequestError;
}

export async function runProviderRequestWithTimeout<T>(
  input: {
    provider: ProviderName;
    operation: string;
    timeoutMs: number;
  },
  callback: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    return await callback(controller.signal);
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      throw new ProviderRequestError({
        provider: input.provider,
        operation: input.operation,
        reasonCode: "timeout"
      });
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function providerReasonCodeFromResponseText(text: string): string | undefined {
  if (!text) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    const record =
      parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    const reason = record.error ?? record.code ?? record.reason;

    return typeof reason === "string" ? sanitizeProviderReasonCode(reason) : undefined;
  } catch {
    return undefined;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function sanitizeProviderReasonCode(value: string): string {
  return value.replace(/[^a-z0-9_.:-]+/giu, "_").slice(0, 80);
}
