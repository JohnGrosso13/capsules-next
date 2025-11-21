import { fetchOpenAI, hasOpenAIApiKey } from "@/adapters/ai/openai/server";
import { serverEnv } from "@/lib/env/server";

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type ChatMessage = Record<string, unknown>;

export type JsonSchema = { name: string; schema: Record<string, unknown> };

export type ToolCallDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  function: { name: string; arguments: string };
};

type ChatCompletionMessage = {
  role?: string;
  content?: string | null;
  tool_calls?: ToolCall[];
};

export class AIConfigError extends Error {
  constructor(message: string) {
    super(message);

    this.name = "AIConfigError";
  }
}

export function requireOpenAIKey() {
  if (!hasOpenAIApiKey()) {
    throw new AIConfigError(
      "OpenAI API key is not configured. Set OPENAI_API_KEY in the environment.",
    );
  }
}

export function extractJSON<T = Record<string, unknown>>(maybeJSONString: unknown): T | null {
  if (maybeJSONString && typeof maybeJSONString === "object") {
    return maybeJSONString as T;
  }

  const text = String(maybeJSONString ?? "");

  try {
    return JSON.parse(text) as T;
  } catch {
    // continue
  }

  try {
    const fenced = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");

    return JSON.parse(fenced) as T;
  } catch {
    // continue
  }

  try {
    const start = text.indexOf("{");

    const end = text.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1)) as T;
    }
  } catch {
    // ignore incomplete fragments
  }

  return null;
}

function approximateSize(messages: ChatMessage[]): number {
  try {
    return JSON.stringify(messages).length;
  } catch {
    return 0;
  }
}

function coerceString(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function compactContent(content: string, limit: number): string {
  if (content.length <= limit) return content;
  return `${content.slice(0, Math.max(0, limit - 3))}...`;
}

function stripNoisyLines(text: string): string {
  const lines = text.split("\n");
  const filtered = lines.filter((line) => {
    const lower = line.toLowerCase();
    if (lower.startsWith("media: ")) return false;
    if (lower.startsWith("attachments referenced:")) return false;
    return true;
  });
  return filtered.join("\n");
}

function compactMessagesForBudget(messages: ChatMessage[], budget = 50000): ChatMessage[] {
  const getRole = (m: ChatMessage): string => {
    const r = (m as Record<string, unknown>)["role"];
    return typeof r === "string" ? r : "";
  };
  const getContent = (m: ChatMessage): string => {
    const c = (m as Record<string, unknown>)["content"];
    return typeof c === "string" ? c : String(c ?? "");
  };

  let result = messages.map((m) => ({ ...m }));
  if (approximateSize(result) <= budget) return result;

  const lastAssistantIndex = [...result].reverse().findIndex((m) => getRole(m) === "assistant");
  if (lastAssistantIndex >= 0) {
    const absoluteIndex = result.length - 1 - lastAssistantIndex;
    result = result.filter((m, i) => getRole(m) !== "assistant" || i === absoluteIndex);
  }
  if (approximateSize(result) <= budget) return result;

  result = result.map((m) => {
    const role = getRole(m);
    const content = coerceString(getContent(m));
    let cleaned = stripNoisyLines(content);
    if (role === "system") {
      const isUserCard = /\bUser profile:/i.test(cleaned);
      const isContext = /\bContext memories to ground your response:/i.test(cleaned);
      cleaned = compactContent(cleaned, isContext ? 4000 : isUserCard ? 1200 : 3000);
    } else {
      cleaned = compactContent(cleaned, 4000);
    }
    const clone = { ...(m as Record<string, unknown>) };
    (clone as Record<string, unknown>)["content"] = cleaned;
    return clone as ChatMessage;
  });
  if (approximateSize(result) <= budget) return result;

  const systems = result.filter((m) => getRole(m) === "system") as ChatMessage[];
  const firstSystem: ChatMessage[] = systems[0] ? [systems[0] as ChatMessage] : [];
  const extraSystem: ChatMessage[] = systems[1] ? [systems[1] as ChatMessage] : [];
  const lastUserIndex = [...result].reverse().findIndex((m) => getRole(m) === "user");
  const lastUser: ChatMessage[] =
    lastUserIndex >= 0 ? [result[result.length - 1 - lastUserIndex] as ChatMessage] : [];
  const lastAssistantIdx = [...result].reverse().findIndex((m) => getRole(m) === "assistant");
  const lastAssistant: ChatMessage[] =
    lastAssistantIdx >= 0 ? [result[result.length - 1 - lastAssistantIdx] as ChatMessage] : [];
  result = [...firstSystem, ...extraSystem, ...lastUser, ...lastAssistant];
  if (approximateSize(result) <= budget) return result;

  result = [...firstSystem, ...lastUser];
  return result;
}

function isGpt5Family(modelName: string | null | undefined): boolean {
  return typeof modelName === "string" && /^gpt-5/i.test(modelName.trim());
}

async function postChatWithRetries(
  body: Record<string, unknown>,
  retryDelaysMs: number[],
  timeoutOverride?: number,
): Promise<{ response: Response; json: Json }> {
  let lastResponse: Response | null = null;
  let lastJson: Json = {};
  const timeoutMs = Number.isFinite(timeoutOverride) ? (timeoutOverride as number) : 45000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  for (const delay of retryDelaysMs) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const response = await fetchOpenAI("/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const json = (await response.json().catch(() => ({}))) as Json;
    if (response.ok) {
      clearTimeout(timeoutId);
      return { response, json };
    }

    lastResponse = response;
    lastJson = json;

    if (response.status !== 429 && response.status < 500) {
      break;
    }
  }

  clearTimeout(timeoutId);
  return { response: lastResponse as Response, json: lastJson };
}

function shouldTryFallback(
  response: Response,
  body: Json,
  baseModel: string | null | undefined,
  fallbackModel: string | null | undefined,
): boolean {
  if (!fallbackModel) return false;
  if (response.ok) return false;
  if (response.status === 429 || response.status >= 500) return true;
  const meta = (body || {}) as Record<string, unknown>;
  const error = (meta["error"] as Record<string, unknown>) ?? {};
  const code = typeof error.code === "string" ? error.code : null;
  if (code === "unsupported_parameter" || code === "unsupported_value") return true;
  if (response.status === 400 && isGpt5Family(baseModel)) return true;
  return false;
}

async function performChatCompletion(params: {
  messages: ChatMessage[];
  schema?: JsonSchema | null;
  tools?: ToolCallDefinition[] | null;
  toolChoice?: Record<string, unknown> | string | null;
  temperature?: number;
  model?: string | null;
  fallbackModel?: string | null;
  timeoutMs?: number;
}): Promise<{ message: ChatCompletionMessage; raw: Json }> {
  requireOpenAIKey();

  const baseModel = params.model ?? serverEnv.OPENAI_MODEL;
  const fallbackModel = params.fallbackModel ?? serverEnv.OPENAI_MODEL_FALLBACK ?? null;
  const retryDelaysMs =
    fallbackModel && fallbackModel !== baseModel ? [0] : [0, 800, 1600];
  const cleanedMessages = compactMessagesForBudget(params.messages);

  const buildPayload = (modelName: string): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
      model: modelName,
      messages: cleanedMessages,
    };

    const requestedTemperature = params.temperature ?? 0.7;
    if (!isGpt5Family(modelName)) {
      payload.temperature = requestedTemperature;
    } else if (params.temperature === 1) {
      payload.temperature = 1;
    }

  if (params.tools && params.tools.length) {
    payload.tools = params.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
    if (params.toolChoice) {
      payload.tool_choice = params.toolChoice;
    }
  } else if (params.schema) {
      payload.response_format = { type: "json_schema", json_schema: params.schema };
    } else {
      payload.response_format = { type: "json_object" };
    }

    return payload;
  };

  let attemptModel = baseModel;
  let { response, json } = await postChatWithRetries(
    buildPayload(attemptModel),
    retryDelaysMs,
    params.timeoutMs,
  );

  if (
    !response.ok &&
    shouldTryFallback(response, json, baseModel, fallbackModel) &&
    fallbackModel &&
    fallbackModel !== attemptModel
  ) {
    attemptModel = fallbackModel;
    ({ response, json } = await postChatWithRetries(
      buildPayload(attemptModel),
      retryDelaysMs,
      params.timeoutMs,
    ));
  }

  if (!response.ok) {
    const error = new Error(`OpenAI chat error: ${response.status}`);
    (error as Error & { meta?: Json }).meta = json;
    throw error;
  }

  const choices = (json as Record<string, unknown>).choices;
  const message =
    Array.isArray(choices) && choices[0]
      ? ((choices[0] as Record<string, unknown>).message as ChatCompletionMessage | undefined)
      : null;

  if (!message) {
    throw new Error("OpenAI chat returned empty message.");
  }

  return { message, raw: json };
}

export async function callOpenAIChat(
  messages: ChatMessage[],
  schema: JsonSchema | null,
  options: {
    temperature?: number;
    model?: string | null;
    fallbackModel?: string | null;
    timeoutMs?: number;
  } = {},
): Promise<{ content: string; raw: Json }> {
  const params: Parameters<typeof performChatCompletion>[0] = {
    messages,
    schema,
  };
  if (options.model !== undefined) {
    params.model = options.model;
  }
  if (options.fallbackModel !== undefined) {
    params.fallbackModel = options.fallbackModel;
  }
  if (options.timeoutMs !== undefined) {
    params.timeoutMs = options.timeoutMs;
  }
  if (typeof options.temperature === "number") {
    params.temperature = options.temperature;
  }
  const { message, raw } = await performChatCompletion(params);

  const content = typeof message.content === "string" ? message.content : null;
  if (!content) {
    throw new Error("OpenAI chat returned empty content.");
  }

  return { content, raw };
}

export async function callOpenAIToolChat(
  messages: ChatMessage[],
  tools: ToolCallDefinition[],
  options: {
    temperature?: number;
    model?: string | null;
    fallbackModel?: string | null;
    timeoutMs?: number;
    toolChoice?: Record<string, unknown> | string | null;
  } = {},
): Promise<{ message: ChatCompletionMessage; raw: Json }> {
  const params: Parameters<typeof performChatCompletion>[0] = {
    messages,
    tools,
    toolChoice: options.toolChoice ?? "auto",
  };
  if (options.model !== undefined) {
    params.model = options.model;
  }
  if (options.fallbackModel !== undefined) {
    params.fallbackModel = options.fallbackModel;
  }
  if (options.timeoutMs !== undefined) {
    params.timeoutMs = options.timeoutMs;
  }
  if (typeof options.temperature === "number") {
    params.temperature = options.temperature;
  }
  return performChatCompletion(params);
}



