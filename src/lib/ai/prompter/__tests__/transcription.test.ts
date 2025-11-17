import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/adapters/ai/openai/server", () => {
  return {
    fetchOpenAI: vi.fn(),
    hasOpenAIApiKey: vi.fn(() => true),
  };
});

vi.mock("@/lib/env/server", () => ({
  serverEnv: {
    OPENAI_TRANSCRIBE_MODEL: "test-whisper",
  },
}));

import { fetchOpenAI } from "@/adapters/ai/openai/server";
import { transcribeAudioFromBase64 } from "../transcription";

const fetchOpenAIMock = vi.mocked(fetchOpenAI);

describe("transcribeAudioFromBase64", () => {
  beforeEach(() => {
    fetchOpenAIMock.mockReset();
  });

  it("sends the audio blob with model selection and returns transcript text", async () => {
    fetchOpenAIMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ text: "hello world" }),
    } as unknown as Response);

    const audio = Buffer.from("sample").toString("base64");
    const result = await transcribeAudioFromBase64({ audioBase64: audio, mime: "audio/webm" });

    expect(fetchOpenAIMock).toHaveBeenCalledTimes(1);

    const request = fetchOpenAIMock.mock.calls[0]?.[1] as { body: FormData } | undefined;
    const body = request?.body as FormData;

    expect(body.get("model")).toBe("test-whisper");
    const file = body.get("file") as File;
    expect(file.name).toBe("recording.webm");
    expect(result.text).toBe("hello world");
  });
});
