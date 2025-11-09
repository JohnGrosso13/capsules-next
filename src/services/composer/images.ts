"use client";

export type ImageRunResult = {
  url: string;
};

export async function requestImageGeneration(prompt: string): Promise<ImageRunResult> {
  const response = await fetch("/api/ai/image/generate", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const json = (await response.json().catch(() => null)) as { url?: string } | null;
  if (!response.ok || !json?.url) {
    throw new Error(`Image generate failed (${response.status})`);
  }
  return { url: json.url };
}

export async function requestImageEdit({
  imageUrl,
  instruction,
}: {
  imageUrl: string;
  instruction: string;
}): Promise<ImageRunResult> {
  const response = await fetch("/api/ai/image/edit", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl, instruction }),
  });
  const json = (await response.json().catch(() => null)) as { url?: string } | null;
  if (!response.ok || !json?.url) {
    throw new Error(`Image edit failed (${response.status})`);
  }
  return { url: json.url };
}
