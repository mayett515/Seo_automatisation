import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { FileSystemObjectStorageAdapter } from "./file-system-object-storage.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

void describe("filesystem media storage", () => {
  void it("creates an API PUT grant and preserves bounded binary metadata", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "localseo-media-"));
    roots.push(root);
    const storage = new FileSystemObjectStorageAdapter(root);
    const expiresAt = new Date("2026-07-12T10:10:00.000Z");
    const body = new Uint8Array([1, 2, 3, 4]);
    const sha256 = "b".repeat(64);

    const grant = await storage.createUploadGrant({
      key: "media/quarantine/project/asset/source",
      contentType: "image/png",
      contentLength: body.byteLength,
      sha256,
      projectId: "project",
      assetId: "asset",
      expiresAt,
      apiPutUrl: "/projects/project/media/assets/asset/content"
    });
    assert.equal(grant.kind, "api_put");
    assert.equal(grant.expiresAt, expiresAt.toISOString());

    await storage.putPrivateObject({
      key: "media/quarantine/project/asset/source",
      body,
      contentType: "image/png",
      sha256
    });
    assert.deepEqual(
      Array.from(await storage.readPrivateObject({ key: "media/quarantine/project/asset/source", maxBytes: 4 })),
      Array.from(body)
    );
    assert.deepEqual(await storage.headPrivateObject({ key: "media/quarantine/project/asset/source" }), {
      key: "media/quarantine/project/asset/source",
      contentLength: 4,
      contentType: "image/png",
      sha256
    });

    await storage.deletePrivateObject({ key: "media/quarantine/project/asset/source" });
    assert.equal(await storage.headPrivateObject({ key: "media/quarantine/project/asset/source" }), undefined);
  });

  void it("rejects reads beyond the declared byte bound", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "localseo-media-"));
    roots.push(root);
    const storage = new FileSystemObjectStorageAdapter(root);
    await storage.putPrivateObject({
      key: "media/source",
      body: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
      sha256: "c".repeat(64)
    });

    await assert.rejects(() => storage.readPrivateObject({ key: "media/source", maxBytes: 2 }), /bounded read limit/u);
  });
});
