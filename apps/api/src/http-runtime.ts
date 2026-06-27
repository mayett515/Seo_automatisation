export type TrustProxySetting = boolean | number | string | string[];

export function resolveTrustProxy(value: string): TrustProxySetting {
  const normalized = value.trim();
  const lower = normalized.toLowerCase();

  if (lower === "false" || lower === "0") {
    return false;
  }

  if (lower === "true") {
    return true;
  }

  if (/^\d+$/u.test(normalized)) {
    return Number(normalized);
  }

  if (normalized.includes(",")) {
    return normalized
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return normalized;
}
