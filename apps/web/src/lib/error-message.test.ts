import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { errorMessage } from "./error-message.js";

void describe("errorMessage", () => {
  void it("combines fallback and error message when error is an Error with non-empty message", () => {
    assert.equal(errorMessage(new Error("Network failed"), "Operation failed."), "Operation failed. Network failed");
  });

  void it("returns fallback when error is an Error with empty or whitespace message", () => {
    assert.equal(errorMessage(new Error(""), "Operation failed."), "Operation failed.");
    assert.equal(errorMessage(new Error("   "), "Operation failed."), "Operation failed.");
  });

  void it("returns fallback when error is not an Error instance", () => {
    assert.equal(errorMessage(null, "Operation failed."), "Operation failed.");
    assert.equal(errorMessage("string error", "Operation failed."), "Operation failed.");
    assert.equal(errorMessage({ message: "custom" }, "Operation failed."), "Operation failed.");
  });
});
