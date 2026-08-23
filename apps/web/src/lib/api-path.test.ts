import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { projectApiPath } from "./api-path.js";

void describe("projectApiPath", () => {
  void it("encodes projectId and appends suffix", () => {
    assert.equal(projectApiPath("project-1", "/pages"), "/projects/project-1/pages");
    assert.equal(projectApiPath("proj/123", "/gsc/sync"), "/projects/proj%2F123/gsc/sync");
  });
});
