export type ComposerDraft = {
  kind: string;
  title?: string | null;
  content: string;
  mediaUrl: string | null;
  mediaPrompt: string | null;
  poll?: { question: string; options: string[] } | null;
  suggestions?: string[];
};

export function ensurePollStructure(input: ComposerDraft | null): {
  question: string;
  options: string[];
} {
  if (!input) return { question: "", options: ["", ""] };
  const raw =
    input.poll && typeof input.poll === "object"
      ? { ...input.poll }
      : { question: "", options: [] };
  const question = typeof raw.question === "string" ? raw.question : "";
  let options = Array.isArray(raw.options) ? raw.options.map((value) => String(value ?? "")) : [];
  if (options.length < 2) {
    options = [...options, "", ""].slice(0, Math.max(2, options.length + 2));
  }
  return { question, options };
}

export function isComposerDraftReady(draft: ComposerDraft | null): boolean {
  if (!draft) return false;
  const kind = (draft.kind ?? "text").toLowerCase();
  if (kind === "poll") {
    const poll = ensurePollStructure(draft);
    return (
      poll.question.trim().length > 0 && poll.options.some((option) => option.trim().length > 0)
    );
  }
  if (kind === "image" || kind === "video") {
    return Boolean(draft.mediaUrl && draft.mediaUrl.trim().length > 0);
  }
  return draft.content.trim().length > 0;
}
