import { ensurePollStructure, type ComposerDraft } from "@/lib/composer/draft";

export type PollMergeOptions = {
  preserveOptions?: boolean;
};

export type DraftMergeOptions = {
  preservePollOptions?: boolean;
};

export function mergePollStructures(
  prevDraft: ComposerDraft | null,
  nextDraft: ComposerDraft | null,
  options?: PollMergeOptions,
): { question: string; options: string[] } | null {
  const prevPoll = prevDraft?.poll ? ensurePollStructure(prevDraft) : null;
  const nextPoll = nextDraft?.poll ? ensurePollStructure(nextDraft) : null;
  if (!prevPoll && !nextPoll) {
    return null;
  }
  if (!prevPoll) {
    return nextPoll ? { question: nextPoll.question, options: [...nextPoll.options] } : null;
  }
  if (!nextPoll) {
    return { question: prevPoll.question, options: [...prevPoll.options] };
  }
  if (options?.preserveOptions && prevPoll) {
    const question =
      nextPoll.question.trim().length > 0 ? nextPoll.question : prevPoll.question;
    const preserved = [...prevPoll.options];
    while (preserved.length < 2) {
      preserved.push("");
    }
    return { question, options: preserved };
  }
  const question = nextPoll.question.trim().length > 0 ? nextPoll.question : prevPoll.question;
  const length = Math.max(prevPoll.options.length, nextPoll.options.length, 2);
  const mergedOptions = Array.from({ length }, (_, index) => {
    const nextValueRaw = nextPoll.options[index] ?? "";
    const nextValue = nextValueRaw.trim();
    if (nextValue.length > 0) {
      return nextPoll.options[index]!;
    }
    return prevPoll.options[index] ?? "";
  });
  while (mergedOptions.length < 2) {
    mergedOptions.push("");
  }
  return { question, options: mergedOptions };
}

export function mergeComposerDrafts(
  prevDraft: ComposerDraft | null,
  nextDraft: ComposerDraft,
  options?: DraftMergeOptions,
): ComposerDraft {
  const preservePollOptions = options?.preservePollOptions ?? false;
  if (!prevDraft) {
    const poll = mergePollStructures(null, nextDraft, { preserveOptions: preservePollOptions });
    return poll ? { ...nextDraft, poll } : nextDraft;
  }

  const prevKind = (prevDraft.kind ?? "").toLowerCase();
  const nextKind = (nextDraft.kind ?? "").toLowerCase();
  const mergedPoll = mergePollStructures(prevDraft, nextDraft, {
    preserveOptions: preservePollOptions,
  });

  if (nextKind === "poll" && prevKind !== "poll") {
    const merged: ComposerDraft = {
      ...prevDraft,
      poll: mergedPoll ?? prevDraft.poll ?? nextDraft.poll ?? null,
    };
    if (Array.isArray(nextDraft.suggestions) && nextDraft.suggestions.length) {
      merged.suggestions = nextDraft.suggestions;
    }
    return merged;
  }

  if (nextKind === "poll" && prevKind === "poll") {
    return {
      ...prevDraft,
      ...nextDraft,
      kind: "poll",
      poll: mergedPoll ?? nextDraft.poll ?? prevDraft.poll ?? null,
    };
  }

  const merged: ComposerDraft = {
    ...prevDraft,
    ...nextDraft,
  };
  merged.kind = nextDraft.kind ?? prevDraft.kind;
  const restorePreviousMedia = (
    key:
      | "mediaUrl"
      | "mediaPrompt"
      | "mediaThumbnailUrl"
      | "mediaPlaybackUrl"
      | "muxPlaybackId"
      | "muxAssetId",
  ) => {
    const incoming = nextDraft[key];
    const previous = prevDraft[key];
    const incomingString = typeof incoming === "string" ? incoming.trim() : "";
    const previousString = typeof previous === "string" ? previous.trim() : "";
    const shouldRestore =
      (incoming == null || incomingString.length === 0) && previousString.length > 0;
    if (shouldRestore) {
      const target = merged as Record<typeof key, string | null | undefined>;
      if (typeof previous === "string") {
        target[key] = previous;
      } else if (previous === null) {
        target[key] = null;
      }
    }
  };
  restorePreviousMedia("mediaUrl");
  restorePreviousMedia("mediaPrompt");
  restorePreviousMedia("mediaThumbnailUrl");
  restorePreviousMedia("mediaPlaybackUrl");
  restorePreviousMedia("muxPlaybackId");
  restorePreviousMedia("muxAssetId");
  const incomingDuration = nextDraft.mediaDurationSeconds;
  const previousDuration = prevDraft.mediaDurationSeconds;
  if (
    (incomingDuration == null || !Number.isFinite(incomingDuration)) &&
    typeof previousDuration === "number" &&
    Number.isFinite(previousDuration)
  ) {
    merged.mediaDurationSeconds = previousDuration;
  }
  if (mergedPoll || prevDraft.poll || nextDraft.poll) {
    merged.poll = mergedPoll ?? nextDraft.poll ?? prevDraft.poll ?? null;
  }
  return merged;
}
