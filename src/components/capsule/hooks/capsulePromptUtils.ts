"use client";

export function buildPromptEnvelope(
  base: string | null,
  refinements: string[],
  latest: string,
): string {
  const segments = [
    base ?? "",
    ...refinements,
    latest,
  ]
    .map((segment) => segment.trim())
    .filter((segment) => segment.length);

  if (!segments.length) {
    return latest.trim();
  }

  return segments
    .map((segment, index) => (index === 0 ? segment : `Refine with: ${segment}`))
    .join("\n\n");
}

