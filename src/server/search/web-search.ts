import "server-only";

export type WebSearchSnippet = {
  id: string;
  title: string | null;
  snippet: string;
  url: string | null;
  source: string;
  tags: string[];
};

type DuckDuckGoTopic = {
  FirstURL?: string;
  Text?: string;
  Topics?: DuckDuckGoTopic[];
};

type DuckDuckGoResponse = {
  Abstract?: string;
  AbstractText?: string;
  AbstractURL?: string;
  RelatedTopics?: DuckDuckGoTopic[];
};

function flattenTopics(topics: DuckDuckGoTopic[] | undefined): DuckDuckGoTopic[] {
  if (!topics?.length) return [];
  const output: DuckDuckGoTopic[] = [];
  for (const item of topics) {
    if (item.Topics?.length) {
      output.push(...flattenTopics(item.Topics));
    } else {
      output.push(item);
    }
  }
  return output;
}

function normalizeText(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function searchWeb(
  query: string,
  { limit = 4 }: { limit?: number } = {},
): Promise<WebSearchSnippet[]> {
  const trimmed = query.trim();
  if (!trimmed.length) return [];

  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(trimmed)}&format=json&no_redirect=1&no_html=1&t=CapsulesAI`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "CapsulesAI/1.0 (+capsules.ai)" },
      // DuckDuckGo respects GET without auth; keep timeout small via signal if desired later.
    });
    if (!response.ok) return [];

    const data = (await response.json().catch(() => null)) as DuckDuckGoResponse | null;
    if (!data) return [];

    const items: WebSearchSnippet[] = [];

    const abstractText = normalizeText(data.AbstractText ?? data.Abstract);
    const abstractUrl = normalizeText(data.AbstractURL);
    if (abstractText) {
      items.push({
        id: `web:abstract:${abstractUrl ?? "n/a"}`,
        title: "Answer summary",
        snippet: abstractText,
        url: abstractUrl,
        source: "web_search",
        tags: ["web", "duckduckgo"],
      });
    }

    const related = flattenTopics(data.RelatedTopics);
    for (const topic of related) {
      if (items.length >= limit) break;
      const text = normalizeText(topic.Text);
      if (!text) continue;
      const firstUrl = normalizeText(topic.FirstURL);
      items.push({
        id: `web:rt:${firstUrl ?? text.slice(0, 32)}`,
        title: text,
        snippet: text,
        url: firstUrl,
        source: "web_search",
        tags: ["web", "duckduckgo"],
      });
    }

    return items.slice(0, limit);
  } catch (error) {
    console.warn("web search failed", error);
    return [];
  }
}
