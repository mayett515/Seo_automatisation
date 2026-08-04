import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ServiceUnavailableException } from "@nestjs/common";
import type { ImmutableArtifactReaderPort } from "@localseo/adapters";
import { requireArtifactReader } from "./report-aggregate-store.js";

void describe("requireArtifactReader", () => {
  void it("preserves the configured reader and fails closed when storage is unavailable", () => {
    const reader: ImmutableArtifactReaderPort = {
      readImmutableArtifact: () => Promise.resolve(new Uint8Array()),
      headImmutableArtifact: () => Promise.resolve(undefined)
    };

    assert.equal(requireArtifactReader(reader), reader);
    assert.throws(
      () => requireArtifactReader(undefined),
      (error: unknown) =>
        error instanceof ServiceUnavailableException &&
        error.message === "Immutable report artifact storage is unavailable."
    );
  });
});
