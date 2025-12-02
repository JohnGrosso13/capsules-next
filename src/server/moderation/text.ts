import { hasOpenAIApiKey, postOpenAIJson } from "@/adapters/ai/openai/server";
import { serverEnv } from "@/lib/env/server";

export type ModerationDecision = {
  decision: "allow" | "review" | "block";
  model: string | null;
  scores: Record<string, number>;
  reasons: string[];
};

export class ModerationError extends Error {
  status: number;
  code: string;
  decision: "review" | "block";
  details?: unknown;

  constructor(
    code: string,
    message: string,
    decision: "review" | "block",
    status = 400,
    details?: unknown,
  ) {
    super(message);
    this.name = "ModerationError";
    this.status = status;
    this.code = code;
    this.decision = decision;
    this.details = details;
  }
}

type OpenAIModerationResponse = {
  id?: string;
  model?: string;
  results?: Array<{
    categories: Record<string, boolean>;
    category_scores: Record<string, number>;
    flagged?: boolean;
  }>;
};

const CATEGORY_DISPLAY: Record<string, string> = {
  "sexual": "sexual content",
  "sexual/minors": "sexual minors",
  "violence": "violence",
  "violence/graphic": "graphic violence",
  "self-harm": "self-harm",
  "self-harm/intent": "self-harm intent",
  "self-harm/instructions": "self-harm instructions",
  "hate": "hate",
  "hate/threatening": "hate (threatening)",
  "harassment": "harassment",
  "harassment/threatening": "harassment (threatening)",
  "illicit": "illicit behavior",
  "illicit/drugs": "illicit drugs",
  "illicit/violent": "illicit violent behavior",
};

function scoreToSeverity(score: number): "none" | "low" | "medium" | "high" {
  if (!Number.isFinite(score) || score <= 0.05) return "none";
  if (score >= 0.85) return "high";
  if (score >= 0.6) return "medium";
  if (score >= 0.25) return "low";
  return "none";
}

function decide(scores: Record<string, number>): { decision: ModerationDecision["decision"]; reasons: string[] } {
  const reasons: string[] = [];
  const scoreFor = (key: string) => scores[key] ?? 0;

  const minors = Math.max(scoreFor("sexual/minors"), scoreFor("self-harm/minors"));
  if (minors >= 0.2) {
    reasons.push("sexual content involving minors");
    return { decision: "block", reasons };
  }

  if (scoreFor("hate/threatening") >= 0.6 || scoreFor("harassment/threatening") >= 0.6) {
    reasons.push("threatening hate/harassment");
    return { decision: "block", reasons };
  }

  if (scoreFor("violence/graphic") >= 0.6) {
    reasons.push("graphic violence");
    return { decision: "block", reasons };
  }

  if (scoreFor("self-harm/instructions") >= 0.5) {
    reasons.push("self-harm instructions");
    return { decision: "block", reasons };
  }

  if (
    scoreFor("sexual") >= 0.85 ||
    scoreFor("violence") >= 0.7 ||
    scoreFor("hate") >= 0.5 ||
    scoreFor("harassment") >= 0.5 ||
    scoreFor("self-harm") >= 0.5 ||
    scoreFor("self-harm/intent") >= 0.5 ||
    scoreFor("illicit") >= 0.6 ||
    scoreFor("illicit/drugs") >= 0.6 ||
    scoreFor("illicit/violent") >= 0.6
  ) {
    const flagged: string[] = [];
    Object.entries(scores).forEach(([key, value]) => {
      if (value >= 0.5) {
        const label = CATEGORY_DISPLAY[key] ?? key;
        flagged.push(`${label} (${value.toFixed(2)})`);
      }
    });
    reasons.push(...flagged);
    return { decision: "review", reasons: reasons.length ? reasons : ["needs review"] };
  }

  const anyMedium = Object.values(scores).some((value) => {
    const severity = scoreToSeverity(value);
    return severity === "medium" || severity === "high";
  });
  if (anyMedium) {
    Object.entries(scores).forEach(([key, value]) => {
      const severity = scoreToSeverity(value);
      if (severity === "medium" || severity === "high") {
        reasons.push(`${CATEGORY_DISPLAY[key] ?? key} (${value.toFixed(2)})`);
      }
    });
    return { decision: "review", reasons: reasons.length ? reasons : ["needs review"] };
  }

  return { decision: "allow", reasons: [] };
}

export async function moderateTextContent(
  text: string,
  context: { kind: "post" | "comment" | "message" | "profile"; maxChars?: number },
): Promise<ModerationDecision> {
  const trimmed = (text || "").trim();
  if (!trimmed.length) {
    return { decision: "allow", model: null, scores: {}, reasons: [] };
  }

  const maxChars = Number.isFinite(context.maxChars) ? Math.max(1, Math.trunc(context.maxChars ?? 0)) : 6000;
  const input = trimmed.slice(0, maxChars);

  if (!hasOpenAIApiKey()) {
    return {
      decision: "review",
      model: null,
      scores: {},
      reasons: ["OpenAI API key missing; defaulting to review"],
    };
  }

  const model = serverEnv.OPENAI_MODERATION_MODEL || "omni-moderation-latest";
  const response = await postOpenAIJson<OpenAIModerationResponse>("/moderations", {
    model,
    input,
  });

  if (!response.ok || !response.data?.results?.length) {
    return {
      decision: "review",
      model: response.data?.model ?? model,
      scores: {},
      reasons: ["Moderation service unavailable"],
    };
  }

  const scores = response.data.results[0]?.category_scores ?? {};
  const { decision, reasons } = decide(scores);

  const decisionReasons =
    reasons.length && decision !== "allow"
      ? reasons
      : decision === "allow"
        ? []
        : ["needs review"];

  return {
    decision,
    model: response.data.model ?? model,
    scores,
    reasons: decisionReasons,
  };
}

export async function enforceSafeText(
  text: string,
  context: { kind: "post" | "comment" | "message" | "profile"; maxChars?: number },
): Promise<ModerationDecision> {
  const result = await moderateTextContent(text, context);
  if (result.decision === "block") {
    throw new ModerationError(
      "content_blocked",
      "Content was blocked by the safety policy.",
      "block",
      400,
      result,
    );
  }
  if (result.decision === "review") {
    throw new ModerationError(
      "content_needs_review",
      "Content requires moderator review before publishing.",
      "review",
      409,
      result,
    );
  }
  return result;
}
