export function isDatabaseUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current !== null && typeof current === "object" && !seen.has(current)) {
    seen.add(current);

    if ("code" in current && (current as { code?: unknown }).code === "23505") {
      return true;
    }

    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }

  return false;
}
