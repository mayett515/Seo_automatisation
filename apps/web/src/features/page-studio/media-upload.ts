import {
  CreateMediaUploadIntentRequestSchema,
  MediaUploadCompletionResponseSchema,
  MediaUploadIntentResponseSchema,
  type MediaUploadCompletionResponse,
  type MediaUploadTarget
} from "@localseo/contracts";
import { apiFetch, postJson } from "../../lib/api.js";

export async function uploadProjectMediaAsset(projectId: string, file: File): Promise<MediaUploadCompletionResponse> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const request = CreateMediaUploadIntentRequestSchema.parse({
    displayName: file.name.trim().slice(0, 255) || "Uploaded image",
    claimedContentType: file.type,
    expectedBytes: bytes.byteLength,
    expectedSha256: await sha256Hex(bytes)
  });
  const intent = await postJson(mediaApiPath(projectId, "/upload-intents"), request, MediaUploadIntentResponseSchema);

  await uploadToTarget(intent.upload, file);

  return postJson(
    mediaApiPath(projectId, `/assets/${encodeURIComponent(intent.asset.id)}/complete`),
    {},
    MediaUploadCompletionResponseSchema
  );
}

async function uploadToTarget(target: MediaUploadTarget, file: File): Promise<void> {
  const response =
    target.kind === "api_put"
      ? await apiFetch(target.url, {
          method: "PUT",
          headers: target.headers,
          body: file
        })
      : await uploadPresignedPost(target, file);

  if (!response.ok) {
    throw new Error(`Media upload failed before processing (${response.status}).`);
  }
}

function uploadPresignedPost(
  target: Extract<MediaUploadTarget, { kind: "presigned_post" }>,
  file: File
): Promise<Response> {
  const body = new FormData();
  for (const [key, value] of Object.entries(target.fields).sort(([left], [right]) => left.localeCompare(right))) {
    body.append(key, value);
  }
  body.append("file", file);
  return fetch(target.url, { method: "POST", body });
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function mediaApiPath(projectId: string, suffix: string): string {
  return `/projects/${encodeURIComponent(projectId)}/media${suffix}`;
}
