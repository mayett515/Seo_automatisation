import assert from "node:assert/strict";
import test from "node:test";
import type { AiReasoningRunInput } from "./index.js";
import { DeepSeekReasoningAdapter } from "./deepseek-reasoning.js";

void test("DeepSeekReasoningAdapter posts to the official chat-completions URL and parses JSON content", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const adapter = new DeepSeekReasoningAdapter({
    apiKey: "test-api-key",
    model: "deepseek-v4-flash",
    baseUrl: "https://api.deepseek.com",
    fetchImpl: (url, init = {}) => {
      calls.push({ url: requestUrl(url), init });
      return Promise.resolve(
        jsonResponse({
          model: "deepseek-v4-flash",
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify({ briefs: [], groups: [] })
              },
              finish_reason: "stop"
            }
          ],
          usage: {
            prompt_tokens: 11,
            completion_tokens: 7
          }
        })
      );
    }
  });

  const result = await adapter.runStructured(baseInput());

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.deepEqual(result.outputJson, { briefs: [], groups: [] });
  assert.equal(result.provider, "deepseek");
  assert.equal(result.model, "deepseek-v4-flash");
  assert.equal(result.usage?.inputTokens, 11);
  assert.equal(result.usage?.outputTokens, 7);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://api.deepseek.com/chat/completions");
  assert.equal(authHeader(calls[0]?.init.headers), "Bearer test-api-key");
  const body = JSON.parse(requestBodyText(calls[0]?.init.body)) as Record<string, unknown>;
  assert.equal(body.model, "deepseek-v4-flash");
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.deepEqual(body.thinking, { type: "disabled" });
});

void test("DeepSeekReasoningAdapter maps auth failures to terminal provider_not_configured without storing response bodies", async () => {
  const adapter = new DeepSeekReasoningAdapter({
    apiKey: "test-api-key",
    model: "deepseek-v4-flash",
    fetchImpl: () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "invalid_api_key", detail: "secret provider response" }), { status: 401 })
      )
  });

  const result = await adapter.runStructured(baseInput());

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.failureCode, "provider_not_configured");
  assert.equal(result.diagnostics.detail, "invalid_api_key");
  assert.equal(JSON.stringify(result).includes("secret provider response"), false);
});

void test("DeepSeekReasoningAdapter maps aborted requests to provider_timeout", async () => {
  const adapter = new DeepSeekReasoningAdapter({
    apiKey: "test-api-key",
    model: "deepseek-v4-flash",
    fetchImpl: (_url, init = {}) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      })
  });

  const result = await adapter.runStructured({ ...baseInput(), timeoutMs: 1 });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failureCode, "provider_timeout");
    assert.equal(result.diagnostics.detail, "timeout");
  }
});

void test("DeepSeekReasoningAdapter never includes the API key in failure results", async () => {
  const apiKey = "secret-deepseek-api-key";
  const adapter = new DeepSeekReasoningAdapter({
    apiKey,
    model: "deepseek-v4-flash",
    fetchImpl: () => Promise.resolve(new Response(JSON.stringify({ error: "invalid_api_key" }), { status: 401 }))
  });

  const result = await adapter.runStructured(baseInput());

  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(result).includes(apiKey), false);
});

function baseInput(): AiReasoningRunInput {
  return {
    task: "opportunity_scout",
    projectId: "11111111-1111-4111-8111-111111111111",
    runId: "22222222-2222-4222-8222-222222222222",
    prompt: "Find opportunities.",
    inputJson: { evidence: [] },
    outputSchemaName: "OpportunityScoutOutput",
    timeoutMs: 1000,
    policy: {
      canMutateProduction: false,
      allowedToolCategories: ["read_evidence", "analyze"]
    }
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function authHeader(headers: HeadersInit | undefined): string | null {
  return new Headers(headers).get("authorization");
}

function requestBodyText(body: BodyInit | null | undefined): string {
  if (typeof body !== "string") {
    throw new TypeError("Expected request body to be a string.");
  }
  return body;
}
