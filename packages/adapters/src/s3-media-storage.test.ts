import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { S3ObjectStorageAdapter } from "./s3-object-storage.js";

void describe("S3 media upload grants", () => {
  void it("binds one private key, exact byte length, allow-listed type, checksum, project, and asset metadata", async () => {
    const client = new S3Client({
      region: "eu-central-1",
      credentials: {
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key"
      }
    });
    const storage = new S3ObjectStorageAdapter({
      bucket: "private-media-test",
      region: "eu-central-1",
      client
    });
    const sha256 = "e".repeat(64);
    const expiresAt = new Date(Date.now() + 10 * 60_000);

    const grant = await storage.createUploadGrant({
      key: "media/quarantine/project/asset/source",
      contentType: "image/png",
      contentLength: 1234,
      sha256,
      projectId: "project",
      assetId: "asset",
      expiresAt
    });

    assert.equal(grant.kind, "presigned_post");
    assert.equal(grant.fields.key, "media/quarantine/project/asset/source");
    assert.equal(grant.fields["Content-Type"], "image/png");
    assert.equal(grant.fields["x-amz-checksum-algorithm"], "SHA256");
    assert.equal(grant.fields["x-amz-checksum-sha256"], Buffer.from(sha256, "hex").toString("base64"));
    assert.equal(grant.fields["x-amz-meta-sha256"], sha256);
    assert.equal(grant.fields["x-amz-meta-project-id"], "project");
    assert.equal(grant.fields["x-amz-meta-asset-id"], "asset");

    const policy = JSON.parse(Buffer.from(grant.fields.Policy ?? "", "base64").toString("utf8")) as {
      conditions: unknown[];
    };
    assert.ok(
      policy.conditions.some((condition) => JSON.stringify(condition) === '["content-length-range",1234,1234]')
    );
    assert.ok(policy.conditions.some((condition) => JSON.stringify(condition) === '{"Content-Type":"image/png"}'));
    assert.ok(
      policy.conditions.some((condition) => JSON.stringify(condition) === '{"x-amz-checksum-algorithm":"SHA256"}')
    );
    assert.ok(
      policy.conditions.some(
        (condition) =>
          JSON.stringify(condition) === `{"x-amz-checksum-sha256":"${Buffer.from(sha256, "hex").toString("base64")}"}`
      )
    );
    assert.ok(policy.conditions.some((condition) => JSON.stringify(condition) === `{"x-amz-meta-sha256":"${sha256}"}`));

    client.destroy();
  });

  void it("bounds private-prefix listings and reports provider truncation", async () => {
    const client = new S3Client({ region: "eu-central-1" });
    const commands: unknown[] = [];
    client.send = ((command: unknown) => {
      commands.push(command);
      return Promise.resolve({
        Contents: [{ Key: "media/ready/project/asset/a.webp" }, { Key: "media/ready/project/asset/b.webp" }],
        IsTruncated: false
      });
    }) as typeof client.send;
    const storage = new S3ObjectStorageAdapter({
      bucket: "private-media-test",
      region: "eu-central-1",
      client
    });

    assert.deepEqual(await storage.listPrivateObjectKeys({ prefix: "media/ready/project/asset/", maxKeys: 1 }), {
      keys: ["media/ready/project/asset/a.webp"],
      truncated: true
    });
    const [command] = commands;
    assert.ok(command instanceof ListObjectsV2Command);
    assert.equal(command.input.Prefix, "media/ready/project/asset/");
    assert.equal(command.input.MaxKeys, 2);
    client.destroy();
  });
});
