import { describe, expect, it } from "vitest";

import { mergeComposerDrafts, mergePollStructures } from "@/components/composer/state/draft-merge";
import type { ComposerDraft } from "@/lib/composer/draft";

describe("draft merge helpers", () => {
  const basePollDraft: ComposerDraft = {
    kind: "poll",
    content: "",
    mediaUrl: null,
    mediaPrompt: null,
    poll: {
      question: "Pick one",
      options: ["A", "B"],
    },
  };

  it("initializes poll structure when no previous draft", () => {
    const merged = mergeComposerDrafts(null, basePollDraft);
    expect(merged.poll?.question).toBe("Pick one");
    expect(merged.poll?.options).toEqual(["A", "B"]);
  });

  it("preserves existing poll options when prompted", () => {
    const prev: ComposerDraft = {
      kind: "poll",
      content: "",
      mediaUrl: null,
      mediaPrompt: null,
      poll: { question: "Prev", options: ["Keep", "These"] },
    };
    const next: ComposerDraft = {
      kind: "poll",
      content: "",
      mediaUrl: null,
      mediaPrompt: null,
      poll: { question: "New question", options: ["", ""] },
    };
    const merged = mergeComposerDrafts(prev, next, { preservePollOptions: true });
    expect(merged.poll?.options).toEqual(["Keep", "These"]);
    expect(merged.poll?.question).toBe("New question");
  });

  it("merges poll options favoring new content when not preserving", () => {
    const prev: ComposerDraft = {
      kind: "poll",
      content: "",
      mediaUrl: null,
      mediaPrompt: null,
      poll: { question: "Prev", options: ["One", "Two"] },
    };
    const next: ComposerDraft = {
      kind: "poll",
      content: "",
      mediaUrl: null,
      mediaPrompt: null,
      poll: { question: "Next", options: ["", "Two updated", "Third"] },
    };
    const mergedPoll = mergePollStructures(prev, next);
    expect(mergedPoll?.question).toBe("Next");
    expect(mergedPoll?.options).toEqual(["One", "Two updated", "Third"]);
  });

  it("merges non-poll drafts preserving kind and content", () => {
    const prev: ComposerDraft = {
      kind: "text",
      content: "Existing content",
      mediaUrl: null,
      mediaPrompt: null,
      poll: null,
    };
    const next: ComposerDraft = {
      kind: "text",
      content: "Updated",
      mediaUrl: null,
      mediaPrompt: null,
      poll: null,
    };
    const merged = mergeComposerDrafts(prev, next);
    expect(merged.kind).toBe("text");
    expect(merged.content).toBe("Updated");
  });

  it("keeps existing media when merging text-only follow ups", () => {
    const prev: ComposerDraft = {
      kind: "image",
      content: "Initial caption",
      mediaUrl: "https://example.com/image.jpg",
      mediaPrompt: "A cool car",
      poll: null,
    };
    const next: ComposerDraft = {
      kind: "text",
      content: "New post copy",
      mediaUrl: null,
      mediaPrompt: null,
      poll: null,
    };
    const merged = mergeComposerDrafts(prev, next);
    expect(merged.mediaUrl).toBe("https://example.com/image.jpg");
    expect(merged.mediaPrompt).toBe("A cool car");
    expect(merged.content).toBe("New post copy");
  });
});
