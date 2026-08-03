import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

  void it("lists bounded private object keys without exposing metadata sidecars", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "localseo-media-"));
    roots.push(root);
    const storage = new FileSystemObjectStorageAdapter(root);
    for (const key of ["media/ready/project/asset/v1/a.webp", "media/ready/project/asset/v1/b.webp"]) {
      await storage.putPrivateObject({
        key,
        body: new Uint8Array([1]),
        contentType: "image/webp",
        sha256: "d".repeat(64)
      });
    }

    assert.deepEqual(await storage.listPrivateObjectKeys({ prefix: "media/ready/project/asset/", maxKeys: 5 }), {
      keys: ["media/ready/project/asset/v1/a.webp", "media/ready/project/asset/v1/b.webp"],
      truncated: false
    });
    assert.deepEqual(await storage.listPrivateObjectKeys({ prefix: "media/ready/project/asset/", maxKeys: 1 }), {
      keys: ["media/ready/project/asset/v1/a.webp"],
      truncated: true
    });
  });

  void it("writes immutable artifacts once and accepts only byte-identical replays", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "localseo-artifact-"));
    roots.push(root);
    const storage = new FileSystemObjectStorageAdapter(root);
    const body = Buffer.from("<html>stable</html>", "utf8");
    const sha256 = createHash("sha256").update(body).digest("hex");
    const key = `reports/project/report/html/artifact/${sha256}.html`;

    const first = await storage.putImmutableArtifact({
      key,
      body,
      contentType: "text/html; charset=utf-8",
      sha256,
      metadata: { projectId: "project" }
    });
    const replay = await storage.putImmutableArtifact({
      key,
      body,
      contentType: "text/html; charset=utf-8",
      sha256,
      metadata: { projectId: "project" }
    });

    assert.deepEqual(replay, first);
    assert.deepEqual(Buffer.from(await storage.readImmutableArtifact({ key, maxBytes: body.byteLength })), body);
    assert.deepEqual(await storage.headImmutableArtifact({ key }), first);
    await assert.rejects(
      () =>
        storage.putImmutableArtifact({
          key,
          body: Buffer.from("<html>changed</html>", "utf8"),
          contentType: "text/html; charset=utf-8",
          sha256: createHash("sha256").update("<html>changed</html>", "utf8").digest("hex")
        }),
      /different bytes/u
    );
    await assert.rejects(
      () =>
        storage.putImmutableArtifact({
          key,
          body,
          contentType: "text/html; charset=utf-8",
          sha256,
          metadata: { projectId: "another-project" }
        }),
      /different metadata/u
    );
  });
});
