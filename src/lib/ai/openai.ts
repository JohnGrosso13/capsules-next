import { serverEnv } from "../env/server";

export async function embedText(input: string) {
  if (!serverEnv.OPENAI_API_KEY) return null;
  const text = input.slice(0, 8000);
  if (!text) return null;
  const model = serverEnv.OPENAI_EMBED_MODEL || "text-embedding-3-small";
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model, input: text, encoding_format: "float" }),
  });
  const json = (await response.json().catch(() => null)) as
    | { data?: Array<{ embedding: number[] }> }
    | null;
  if (!response.ok) {
    console.error("OpenAI embedding error", json);
    return null;
  }
  const embedding = json?.data?.[0]?.embedding;
  return Array.isArray(embedding) ? embedding : null;
}
