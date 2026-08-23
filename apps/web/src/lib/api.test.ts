import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError, createApiError } from "./api.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

void describe("createApiError", () => {
  void it("captures the code from a response body that carries one", async () => {
    const error = await createApiError(jsonResponse(409, { code: "REQUEST_VALIDATION_FAILED", message: "Conflict" }));

    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 409);
    assert.equal(error.code, "REQUEST_VALIDATION_FAILED");
  });

  void it("leaves code undefined when the response body has no code", async () => {
    const error = await createApiError(jsonResponse(503, { message: "Unavailable" }));

    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 503);
    assert.equal(error.code, undefined);
  });

  void it("keeps the message string format unchanged", async () => {
    const withDetail = await createApiError(
      jsonResponse(409, { code: "REQUEST_VALIDATION_FAILED", message: "Conflict" })
    );
    assert.ok(withDetail instanceof ApiError);
    assert.equal(withDetail.message, "API request failed: 409. Conflict");

    const withoutDetail = await createApiError(jsonResponse(503, {}));
    assert.ok(withoutDetail instanceof ApiError);
    assert.equal(withoutDetail.message, "API request failed: 503");
  });
});
