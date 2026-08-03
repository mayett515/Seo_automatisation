import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { readCookieValue } from "./preview-capability.js";

export const reportDocumentCapabilityTtlSeconds = 5 * 60;
export const reportDocumentCookiePrefix = "localseo_report_document_";

const ReportDocumentCapabilityClaimsSchema = z
  .object({
    version: z.literal(1),
    kind: z.enum(["candidate", "published"]),
    projectId: z.string().uuid(),
    reportId: z.string().uuid(),
    artifactId: z.string().uuid(),
    snapshotSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    artifactSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    issuedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive()
  })
  .strict();

export type ReportDocumentCapabilityClaims = z.output<typeof ReportDocumentCapabilityClaimsSchema>;

export function signReportDocumentCapability(
  input: Omit<ReportDocumentCapabilityClaims, "version" | "issuedAt" | "expiresAt">,
  secret: string,
  now = new Date()
): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const claims = ReportDocumentCapabilityClaimsSchema.parse({
    version: 1,
    ...input,
    issuedAt,
    expiresAt: issuedAt + reportDocumentCapabilityTtlSeconds
  });
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret).update(reportDocumentSignatureInput(payload)).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyReportDocumentCapability(
  token: string,
  secret: string,
  now = new Date()
): ReportDocumentCapabilityClaims | undefined {
  if (token.length > 4_096) return undefined;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined;

  const expectedSignature = createHmac("sha256", secret).update(reportDocumentSignatureInput(parts[0])).digest();
  const providedSignature = decodeBase64Url(parts[1]);
  if (!providedSignature || providedSignature.byteLength !== expectedSignature.byteLength) return undefined;
  if (!timingSafeEqual(providedSignature, expectedSignature)) return undefined;

  try {
    const claims = ReportDocumentCapabilityClaimsSchema.parse(
      JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"))
    );
    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (claims.expiresAt <= nowSeconds || claims.issuedAt > nowSeconds + 30) return undefined;
    return claims;
  } catch {
    return undefined;
  }
}

export function reportDocumentCookieName(artifactId: string): string {
  return `${reportDocumentCookiePrefix}${artifactId.replaceAll("-", "")}`;
}

export function readReportDocumentCapability(
  cookieHeader: string | undefined,
  artifactId: string,
  secret: string,
  now = new Date()
): ReportDocumentCapabilityClaims | undefined {
  const token = readCookieValue(cookieHeader, reportDocumentCookieName(artifactId));
  return token ? verifyReportDocumentCapability(token, secret, now) : undefined;
}

export function serializeReportDocumentCapabilityCookie(artifactId: string, token: string): string {
  return [
    `${reportDocumentCookieName(artifactId)}=${token}`,
    "Path=/",
    `Max-Age=${reportDocumentCapabilityTtlSeconds}`,
    "HttpOnly",
    "Secure",
    "SameSite=None",
    "Partitioned"
  ].join("; ");
}

function reportDocumentSignatureInput(payload: string): string {
  return `customer-report-document.v1:${payload}`;
}

function decodeBase64Url(value: string): Buffer | undefined {
  try {
    return Buffer.from(value, "base64url");
  } catch {
    return undefined;
  }
}
