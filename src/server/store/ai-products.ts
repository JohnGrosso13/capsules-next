import "server-only";

import { callOpenAIChat, extractJSON, type JsonSchema } from "@/lib/ai/prompter";
import { getCapsuleSummaryForViewer } from "@/server/capsules/service";

type ProductDraftRequest = {
  capsuleId: string;
  actorId: string;
  templateId: string;
  templateLabel: string;
  templateCategory: string;
  templateBase?: string | null;
  designPrompt?: string | null;
  existingTitle?: string | null;
  existingSummary?: string | null;
  currency?: string | null;
};

type ProductDraftResult = {
  title: string;
  summary: string;
  price: number;
};

const PRODUCT_DRAFT_SCHEMA: JsonSchema = {
  name: "product_draft",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string", minLength: 4, maxLength: 80 },
      summary: { type: "string", minLength: 20, maxLength: 260 },
      price: { type: "number", minimum: 1, maximum: 1000 },
    },
    required: ["title", "summary", "price"],
  },
};

function clampPrice(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return Math.round(value * 100) / 100;
}

export async function draftStoreProductCopy(params: ProductDraftRequest): Promise<ProductDraftResult> {
  const currency = params.currency && params.currency.trim().length ? params.currency.toUpperCase() : "USD";
  const capsule = await getCapsuleSummaryForViewer(params.capsuleId, params.actorId);
  const capsuleName = capsule?.name ?? "Capsule store";

  const details: string[] = [];
  details.push(`Capsule: ${capsuleName}`);
  details.push(`Product template: ${params.templateLabel}`);
  details.push(`Category: ${params.templateCategory}`);
  if (params.templateBase) details.push(`Base product: ${params.templateBase}`);
  if (params.designPrompt) details.push(`Design prompt: ${params.designPrompt}`);
  if (params.existingTitle) details.push(`Existing title: ${params.existingTitle}`);
  if (params.existingSummary) details.push(`Existing summary: ${params.existingSummary}`);

  const priceBand = (() => {
    const category = params.templateCategory.toLowerCase();
    if (category.includes("apparel")) {
      if (params.templateLabel.toLowerCase().includes("hoodie")) return { min: 45, max: 80 };
      if (params.templateLabel.toLowerCase().includes("tee")) return { min: 25, max: 45 };
      return { min: 30, max: 70 };
    }
    if (category.includes("drinkware")) return { min: 18, max: 40 };
    if (category.includes("wall")) return { min: 20, max: 80 };
    if (category.includes("stickers")) return { min: 5, max: 20 };
    return { min: 15, max: 80 };
  })();

  const systemMessage = {
    role: "system" as const,
    content:
      "You are an assistant helping a creator draft storefront copy for a merch product. Respond with concise, plain-English text and a numeric price in the requested currency. Do not include emoji.",
  };

  const userLines: string[] = [];
  userLines.push(
    `Draft a product title, a one-paragraph summary, and a price in ${currency} for this merch item.`,
  );
  userLines.push(
    `Keep the title under 80 characters and the summary under 260 characters. The summary should focus on why a fan would buy it (comfort, story, support for the capsule) rather than manufacturing specs.`,
  );
  userLines.push(
    `Propose a fair creator-friendly price. Stay roughly within this band: minimum ${priceBand.min.toFixed(
      2,
    )} ${currency}, maximum ${priceBand.max.toFixed(2)} ${currency}.`,
  );
  userLines.push("");
  userLines.push("Context:");
  details.forEach((line) => userLines.push(`- ${line}`));

  const userMessage = {
    role: "user" as const,
    content: userLines.join("\n"),
  };

  const { content } = await callOpenAIChat([systemMessage, userMessage], PRODUCT_DRAFT_SCHEMA, {
    temperature: 0.5,
    timeoutMs: 60_000,
  });

  const parsed =
    extractJSON<Record<string, unknown>>(content) ??
    (JSON.parse(content) as Record<string, unknown>);

  const titleRaw = typeof parsed.title === "string" ? parsed.title : "";
  const summaryRaw = typeof parsed.summary === "string" ? parsed.summary : "";
  const priceRaw = typeof parsed.price === "number" ? parsed.price : Number(parsed.price);

  const title = titleRaw.trim().slice(0, 80) || params.existingTitle?.trim() || params.templateLabel;
  const summary = summaryRaw.trim().slice(0, 260) || params.existingSummary?.trim() || "";
  const price = clampPrice(priceRaw || priceBand.min, priceBand.min, priceBand.max);

  return { title, summary, price };
}
