import { serverEnv } from "../env/server";

export async function embedText(input: string) {
  if (!serverEnv.OPENAI_API_KEY) return null;
  const text = input.slice(0, 8000);
  if (!text) return null;
  const model = serverEnv.OPENAI_EMBED_MODEL || "text-embedding-3-large";
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model, input: text, encoding_format: "float" }),
  });
  const json = (await response.json().catch(() => null)) as {
    data?: Array<{ embedding: number[] }>;
  } | null;
  if (!response.ok) {
    console.error("OpenAI embedding error", json);
    return null;
  }
  const embedding = json?.data?.[0]?.embedding;
  return Array.isArray(embedding) ? embedding : null;
}

// Generate a compact caption and salient tags for an image URL.
// Used to enrich vector memory for natural language recall of images.
export async function captionImage(url: string): Promise<string | null> {
  if (!serverEnv.OPENAI_API_KEY) return null;
  if (!url) return null;
  try {
    const normalized = url.toLowerCase();
    if (
      normalized.includes("media.local.example") ||
      normalized.startsWith("http://localhost") ||
      normalized.startsWith("https://localhost")
    ) {
      return null;
    }
  } catch {
    // ignore URL parse errors
  }
  try {
    const model = serverEnv.OPENAI_MODEL || "gpt-4o-mini";
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 180,
        messages: [
          {
            role: "system",
            content:
              "You write short search-friendly photo captions. Output one sentence followed by 6-10 comma-separated tags in [brackets]. Mention clothing, colors, objects, places, season/holiday cues if present.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Describe this image for later semantic search:" },
              { type: "image_url", image_url: { url } },
            ],
          },
        ],
      }),
    });
    const json = (await response.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } }>;
    } | null;
    if (!response.ok) {
      console.error("OpenAI caption error", json);
      return null;
    }
    const text = json?.choices?.[0]?.message?.content?.trim() ?? null;
    return text && text.length ? text : null;
  } catch (error) {
    console.error("captionImage error", error);
    return null;
  }
}
