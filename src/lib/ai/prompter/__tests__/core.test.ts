import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/adapters/ai/openai/server", () => {
  return {
    fetchOpenAI: vi.fn(),
    hasOpenAIApiKey: vi.fn(() => true),
  };
});

vi.mock("@/lib/env/server", () => ({
  serverEnv: {
    OPENAI_MODEL: "gpt-4o-mini",
  },
}));

import { fetchOpenAI } from "@/adapters/ai/openai/server";
import { callOpenAIChat, extractJSON } from "../core";

const fetchOpenAIMock = vi.mocked(fetchOpenAI);

describe("callOpenAIChat", () => {
  beforeEach(() => {
    fetchOpenAIMock.mockReset();
  });

  it("sends schema-driven payloads and returns assistant content", async () => {
    fetchOpenAIMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"result":"ok"}' } }],
      }),
    } as unknown as Response);

    const schema = { name: "Example", schema: { type: "object" } };
    const result = await callOpenAIChat([{ role: "user", content: "hi" }], schema, {
      temperature: 0.4,
    });

    expect(fetchOpenAIMock).toHaveBeenCalledTimes(1);

    const call = fetchOpenAIMock.mock.calls[0];
    expect(call).toBeDefined();
    const [, request] = call!;
    const payload = JSON.parse((request as Record<string, unknown>).body as string) as Record<
      string,
      unknown
    >;

    expect(payload.response_format).toEqual({ type: "json_schema", json_schema: schema });
    expect(payload.temperature).toBe(0.4);
    expect(result.content).toBe('{"result":"ok"}');
  });
});

describe("extractJSON", () => {
  it("parses fenced JSON strings with tolerance", () => {
    const input = "```json\n{\"foo\":\"bar\"}\n```";
    const parsed = extractJSON<Record<string, string>>(input);

    expect(parsed).toEqual({ foo: "bar" });
  });

  it("returns null on invalid payloads", () => {
    expect(extractJSON("maybe")).toBeNull();
  });
});
