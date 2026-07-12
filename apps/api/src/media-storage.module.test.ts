import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMediaAssetStorage } from "./media-storage.module.js";

void describe("createMediaAssetStorage", () => {
  void it("fails closed instead of using filesystem media storage in production", () => {
    assert.throws(
      () =>
        createMediaAssetStorage({
          NODE_ENV: "production",
          S3_BUCKET: undefined,
          AWS_REGION: "eu-central-1",
          LOCAL_OBJECT_STORAGE_DIR: ".local-object-storage"
        }),
      /Production media storage requires S3_BUCKET/u
    );
  });
});
