import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const previewCapabilityTtlSeconds = 5 * 60;
export const previewDocumentCookiePrefix = "localseo_preview_document_";
export const previewAssetCookiePrefix = "localseo_preview_asset_";

const PreviewCapabilityClaimsSchema = z
  .object({
    version: z.literal(1),
    kind: z.enum(["document", "assets"]),
    projectId: z.string().uuid(),
    pageVersionId: z.string().uuid(),
    manifestSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    issuedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive()
  })
  .strict();

export type PreviewCapabilityClaims = z.output<typeof PreviewCapabilityClaimsSchema>;

export type PreviewMediaManifestEntry = {
  assetId: string;
  variantKey: string;
  path: string;
  contentType: "image/webp";
  width: number;
  height: number;
  bytes: number;
  sha256: string;
};

export function previewMediaManifestSha256(entries: readonly PreviewMediaManifestEntry[]): string {
  const canonical = [...entries]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(({ assetId, variantKey, path, contentType, width, height, bytes, sha256 }) => ({
      assetId,
      variantKey,
      path,
      contentType,
      width,
      height,
      bytes,
      sha256
    }));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function signPreviewCapability(
  input: Omit<PreviewCapabilityClaims, "version" | "issuedAt" | "expiresAt">,
  secret: string,
  now = new Date()
): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const claims = PreviewCapabilityClaimsSchema.parse({
    version: 1,
    ...input,
    issuedAt,
    expiresAt: issuedAt + previewCapabilityTtlSeconds
  });
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyPreviewCapability(
  token: string,
  secret: string,
  expectedKind: PreviewCapabilityClaims["kind"],
  now = new Date()
): PreviewCapabilityClaims | undefined {
  if (token.length > 4_096) {
    return undefined;
  }
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return undefined;
  }

  const expectedSignature = createHmac("sha256", secret).update(parts[0]).digest();
  const providedSignature = decodeBase64Url(parts[1]);
  if (!providedSignature || providedSignature.byteLength !== expectedSignature.byteLength) {
    return undefined;
  }
  if (!timingSafeEqual(providedSignature, expectedSignature)) {
    return undefined;
  }

  try {
    const claims = PreviewCapabilityClaimsSchema.parse(JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")));
    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (claims.kind !== expectedKind || claims.expiresAt <= nowSeconds || claims.issuedAt > nowSeconds + 30) {
      return undefined;
    }
    return claims;
  } catch {
    return undefined;
  }
}

export function previewDocumentCookieName(pageVersionId: string): string {
  return `${previewDocumentCookiePrefix}${pageVersionId.replaceAll("-", "")}`;
}

export function previewAssetCookieName(pageVersionId: string): string {
  return `${previewAssetCookiePrefix}${pageVersionId.replaceAll("-", "")}`;
}

export function serializePreviewCapabilityCookie(input: {
  name: string;
  token: string;
  path: "/" | "/assets";
}): string {
  const attributes = [
    `${input.name}=${input.token}`,
    `Path=${input.path}`,
    `Max-Age=${previewCapabilityTtlSeconds}`,
    "HttpOnly",
    "Secure",
    "SameSite=None",
    "Partitioned"
  ];
  return attributes.join("; ");
}

export function readCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  return readCookies(cookieHeader).find((cookie) => cookie.name === name)?.value;
}

export function readCookieValuesByPrefix(cookieHeader: string | undefined, prefix: string): string[] {
  return readCookies(cookieHeader)
    .filter((cookie) => cookie.name.startsWith(prefix))
    .slice(0, 20)
    .map((cookie) => cookie.value);
}

function readCookies(cookieHeader: string | undefined): Array<{ name: string; value: string }> {
  if (!cookieHeader || cookieHeader.length > 32_768) {
    return [];
  }
  return cookieHeader.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator <= 0) {
      return [];
    }
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    return name && value ? [{ name, value }] : [];
  });
}

function decodeBase64Url(value: string): Buffer | undefined {
  try {
    return Buffer.from(value, "base64url");
  } catch {
    return undefined;
  }
}
