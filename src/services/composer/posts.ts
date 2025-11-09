"use client";

export async function persistPost(
  post: Record<string, unknown>,
  userEnvelope?: Record<string, unknown> | null,
) {
  const body: Record<string, unknown> = { post };
  if (userEnvelope && Object.keys(userEnvelope).length) {
    body.user = userEnvelope;
  }
  const response = await fetch("/api/posts", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Post request failed (${response.status})`);
  }
  return response.json().catch(() => null) as Promise<Record<string, unknown> | null>;
}
