import assert from "node:assert/strict";
import test from "node:test";
import type { AiReasoningRunInput } from "./index.js";
import { OpenCodeGoReasoningAdapter } from "./opencode-go-reasoning.js";

void test("OpenCodeGoReasoningAdapter calls the OpenAI-compatible endpoint and parses JSON content", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const adapter = new OpenCodeGoReasoningAdapter({
    apiKey: "test-api-key",
    model: "glm-5.2",
    endpoint: "https://example.test/v1/chat/completions",
    fetchImpl: (url, init = {}) => {
      calls.push({ url: requestUrl(url), init });
      return Promise.resolve(
        jsonResponse({
          model: "glm-5.2",
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
            completion_tokens: 7,
            cost_cents: 2
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
  assert.equal(result.provider, "opencode_go");
  assert.equal(result.model, "glm-5.2");
  assert.equal(result.usage?.inputTokens, 11);
  assert.equal(result.usage?.outputTokens, 7);
  assert.equal(result.usage?.costCents, 2);
  assert.equal(result.diagnostics.finishReason, "stop");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://example.test/v1/chat/completions");
  assert.equal(authHeader(calls[0]?.init.headers), "Bearer test-api-key");
  const body = JSON.parse(requestBodyText(calls[0]?.init.body)) as Record<string, unknown>;
  assert.equal(body.model, "glm-5.2");
  assert.deepEqual(body.response_format, { type: "json_object" });
});

void test("OpenCodeGoReasoningAdapter maps auth failures to terminal provider_not_configured without storing response bodies", async () => {
  const adapter = new OpenCodeGoReasoningAdapter({
    apiKey: "test-api-key",
    model: "glm-5.2",
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

void test("OpenCodeGoReasoningAdapter maps forbidden provider responses to terminal provider_not_configured", async () => {
  const adapter = new OpenCodeGoReasoningAdapter({
    apiKey: "test-api-key",
    model: "glm-5.2",
    fetchImpl: () => Promise.resolve(new Response(JSON.stringify({ error: "missing_go_entitlement" }), { status: 403 }))
  });

  const result = await adapter.runStructured(baseInput());

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failureCode, "provider_not_configured");
    assert.equal(result.diagnostics.detail, "missing_go_entitlement");
  }
});

void test("OpenCodeGoReasoningAdapter maps non-auth non-capacity HTTP failures to provider_error", async () => {
  const adapter = new OpenCodeGoReasoningAdapter({
    apiKey: "test-api-key",
    model: "glm-5.2",
    fetchImpl: () => Promise.resolve(new Response(JSON.stringify({ error: "upstream_failed" }), { status: 500 }))
  });

  const result = await adapter.runStructured(baseInput());

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failureCode, "provider_error");
    assert.equal(result.diagnostics.detail, "upstream_failed");
  }
});

void test("OpenCodeGoReasoningAdapter maps rate limits and capacity failures to provider_overloaded", async () => {
  const adapter = new OpenCodeGoReasoningAdapter({
    apiKey: "test-api-key",
    model: "glm-5.2",
    fetchImpl: () => Promise.resolve(new Response(JSON.stringify({ error: "rate_limit_exceeded" }), { status: 429 }))
  });

  const result = await adapter.runStructured(baseInput());

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failureCode, "provider_overloaded");
    assert.equal(result.diagnostics.detail, "rate_limit_exceeded");
  }
});

void test("OpenCodeGoReasoningAdapter maps invalid completion JSON to output_not_json", async () => {
  const adapter = new OpenCodeGoReasoningAdapter({
    apiKey: "test-api-key",
    model: "glm-5.2",
    fetchImpl: () => Promise.resolve(new Response("not-json", { status: 200 }))
  });

  const result = await adapter.runStructured(baseInput());

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failureCode, "output_not_json");
    assert.equal(result.diagnostics.detail, "invalid_completion_json");
  }
});

void test("OpenCodeGoReasoningAdapter maps non-JSON assistant content to output_not_json", async () => {
  const adapter = new OpenCodeGoReasoningAdapter({
    apiKey: "test-api-key",
    model: "glm-5.2",
    fetchImpl: () =>
      Promise.resolve(
        jsonResponse({
          choices: [{ message: { content: "plain text" } }]
        })
      )
  });

  const result = await adapter.runStructured(baseInput());

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failureCode, "output_not_json");
    assert.equal(result.diagnostics.detail, "invalid_json_content");
  }
});

void test("OpenCodeGoReasoningAdapter maps network errors to sanitized provider diagnostics", async () => {
  const apiKey = "secret-opencode-go-api-key";
  const adapter = new OpenCodeGoReasoningAdapter({
    apiKey,
    model: "glm-5.2",
    fetchImpl: () => Promise.reject(Object.assign(new Error(`connect failed ${apiKey}`), { code: "ECONNREFUSED" }))
  });

  const result = await adapter.runStructured(baseInput());

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failureCode, "provider_error");
    assert.equal(result.diagnostics.detail, "ECONNREFUSED");
    assert.equal(JSON.stringify(result).includes(apiKey), false);
  }
});

void test("OpenCodeGoReasoningAdapter maps aborted requests to provider_timeout", async () => {
  const adapter = new OpenCodeGoReasoningAdapter({
    apiKey: "test-api-key",
    model: "glm-5.2",
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

void test("OpenCodeGoReasoningAdapter never includes the API key in failure results", async () => {
  const apiKey = "secret-opencode-go-api-key";
  const adapters = [
    new OpenCodeGoReasoningAdapter({
      apiKey,
      model: "glm-5.2",
      fetchImpl: () => Promise.resolve(new Response(JSON.stringify({ error: "invalid_api_key" }), { status: 401 }))
    }),
    new OpenCodeGoReasoningAdapter({
      apiKey,
      model: "glm-5.2",
      fetchImpl: () => Promise.resolve(new Response("not-json", { status: 200 }))
    }),
    new OpenCodeGoReasoningAdapter({
      apiKey,
      model: "glm-5.2",
      fetchImpl: () => Promise.resolve(jsonResponse({ choices: [{ message: { content: "plain text" } }] }))
    })
  ];

  for (const adapter of adapters) {
    const result = await adapter.runStructured(baseInput());

    assert.equal(result.ok, false);
    assert.equal(JSON.stringify(result).includes(apiKey), false);
  }
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
