import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import type { ImmutableArtifactReaderPort } from "@localseo/adapters";
import { parseStoredReportSnapshot, requireArtifactReader, type ReportRow } from "./report-aggregate-store.js";

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

void describe("parseStoredReportSnapshot", () => {
  void it("preserves JSON.parse SyntaxError as cause when stored snapshot text is invalid", () => {
    assert.throws(
      () => parseStoredReportSnapshot({ snapshotCanonicalText: "{not-json" } as ReportRow),
      (error: unknown) =>
        error instanceof UnprocessableEntityException &&
        error.message === "Stored customer report snapshot is not valid JSON." &&
        error.cause instanceof SyntaxError
    );
  });
});
