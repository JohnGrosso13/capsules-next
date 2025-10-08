export type PrompterToolKey =
  | "poll"
  | "logo"
  | "image_edit"
  | "document_pdf"
  | "document_ppt"
  | "tournament"
  | "ladder";

export type SuggestedTool = { key: PrompterToolKey; label: string };

const TOOL_LABELS: Record<PrompterToolKey, string> = {
  poll: "Create a poll",
  logo: "Design a logo",
  image_edit: "Vibe this image",
  document_pdf: "Draft a PDF",
  document_ppt: "Draft a presentation",
  tournament: "Start a tournament",
  ladder: "Create a ladder",
};

export function toolLabel(key: PrompterToolKey): string {
  return TOOL_LABELS[key] ?? key;
}

function hasWord(text: string, re: RegExp): boolean {
  return re.test(text);
}

/**
 * Heuristic tool suggestions based on text + attachment context.
 * Keeps output small, ordered by likelihood.
 */
export function detectSuggestedTools(
  raw: string,
  opts: { hasAttachment?: boolean; attachmentMime?: string | null } = {},
): SuggestedTool[] {
  const text = (raw || "").trim().toLowerCase();
  const has = Boolean(opts.hasAttachment);
  const mime = (opts.attachmentMime || "").toLowerCase();

  const out: SuggestedTool[] = [];

  // Poll/survey intent
  if (hasWord(text, /(poll|survey|vote|choices?)/)) {
    out.push({ key: "poll", label: TOOL_LABELS.poll });
  }

  // Logos & branding intent
  if (hasWord(text, /(logo|brand\s*(mark|kit)?|wordmark|emblem|badge)/)) {
    out.push({ key: "logo", label: TOOL_LABELS.logo });
  }

  // Image vibe/edit intent (requires an image attachment ideally)
  const isImageAttachment = has && mime.startsWith("image/");
  if (
    isImageAttachment &&
    hasWord(text, /(vibe|restyle|recolor|edit|remix|touch\s*up|enhance|filter)/)
  ) {
    out.push({ key: "image_edit", label: TOOL_LABELS.image_edit });
  }

  // Documents (pdf/ppt) – suggest lightly
  if (hasWord(text, /(pdf|document|whitepaper)/)) {
    out.push({ key: "document_pdf", label: TOOL_LABELS.document_pdf });
  }
  if (hasWord(text, /(slides?|deck|presentation|power\s*point|pptx?)/)) {
    out.push({ key: "document_ppt", label: TOOL_LABELS.document_ppt });
  }

  // Competitive structures – tournaments/ladders
  if (hasWord(text, /(tournament|bracket|knock\s*out)/)) {
    out.push({ key: "tournament", label: TOOL_LABELS.tournament });
  }
  if (hasWord(text, /(ladder|league\s*ladder)/)) {
    out.push({ key: "ladder", label: TOOL_LABELS.ladder });
  }

  // Cap count to 3 to keep UI tidy and focused
  return out.slice(0, 3);
}

