import { NextResponse } from "next/server";

import {
  AIConfigError,
  createPollDraft,
  createPostDraft,
  editImageWithInstruction,
  generateImageFromPrompt,
  refinePostDraft,
  summarizeFeedFromDB,
} from "@/lib/ai/prompter";

type PromptOptions = Record<string, unknown> & {
  prefer?: string;
  type?: string;
  poll_hint?: Record<string, unknown>;
  force?: string;
};

function buildBasePost(incoming: Record<string, unknown> = {}) {
  return {
    kind: typeof incoming.kind === "string" ? incoming.kind : "text",
    content: typeof incoming.content === "string" ? incoming.content : "",
    mediaUrl: typeof incoming.mediaUrl === "string" ? incoming.mediaUrl : null,
    mediaPrompt: typeof incoming.mediaPrompt === "string" ? incoming.mediaPrompt : null,
    poll: incoming.poll,
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const text = typeof body?.message === "string" ? body.message.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }
    if (text.length > 2000) {
      return NextResponse.json({ error: "Message too long" }, { status: 400 });
    }

    const lc = text.toLowerCase();
    const options = (body?.options as PromptOptions | undefined) ?? {};
    const capsuleId = typeof body?.capsuleId === "string" ? body.capsuleId : null;
    const incomingPost = (body?.post as Record<string, unknown> | undefined) ?? null;

    if (/\bsummariz(e|e\s+my)?\b/.test(lc) && /(feed|posts|recent|activity|capsule|this)/.test(lc)) {
      try {
        const summary = await summarizeFeedFromDB({ capsuleId, limit: 30 });
        const extra = summary.bullets && summary.bullets.length
          ? `\n\nHighlights:\n- ${summary.bullets.slice(0, 5).join("\n- ")}`
          : "";
        return NextResponse.json({
          action: "summary",
          message: summary.message + extra,
          suggestion: summary.suggestion || null,
        });
      } catch (error) {
        console.error("Feed summary error:", error);
        return NextResponse.json({
          action: "summary",
          message: "I could not load recent posts to summarize right now.",
        });
      }
    }

    const wantsLight = /(light\s*mode|switch\s*to\s*light|bright(er)?|white\s*theme)/.test(lc);
    const wantsDark = /(dark\s*mode|switch\s*to\s*dark|darker|night\s*mode)/.test(lc);
    if (wantsLight || wantsDark) {
      return NextResponse.json({
        action: "set_theme",
        value: wantsLight ? "light" : "dark",
        message: `Okay - switched to ${wantsLight ? "light" : "dark"} mode.`,
      });
    }

    const preferPoll =
      (typeof options.prefer === "string" && options.prefer === "poll") ||
      (typeof options.type === "string" && options.type === "poll") ||
      /(\bpoll\b|\bsurvey\b|\bvote\b|\bwhich\b|\bchoose\b|would you rather)/.test(lc);

    if (preferPoll) {
      try {
        const seed = (options.poll_hint as Record<string, unknown> | undefined) ?? {};
        const draft = await createPollDraft(text, seed);
        const post = buildBasePost();
        post.kind = "poll";
        post.content = "";
        post.poll = { question: draft.poll.question, options: draft.poll.options };
        return NextResponse.json({ action: "draft_post", message: draft.message, post });
      } catch (error) {
        console.error("Poll draft error:", error);
      }
    }

    const hasNavVerb = /(go\s+to|navigate\s+to|open|take\s+me\s+to|switch\s+to|bring\s+me\s+to|take\s+me|go\b|navigate\b)/.test(lc);
    if (hasNavVerb || /(home|homepage|landing|create|capsule|admin|back|previous)/.test(lc)) {
      if (/\bcapsule\b/.test(lc)) {
        const nameExtractors = [
          /["']([^"']{1,40})["']\s+capsule/i,
          /\bcapsule\s+named\s+["']?([A-Za-z0-9][A-Za-z0-9 _-]{0,40})["']?/i,
          /\b(?:my|the|go\s+to|open|bring\s+me\s+to|take\s+me\s+to)\s+([A-Za-z0-9][A-Za-z0-9 _-]{0,40})\s+capsule\b/i,
        ];
        let capName: string | null = null;
        for (const re of nameExtractors) {
          const match = text.match(re);
          if (match?.[1]) {
            capName = match[1].trim();
            break;
          }
        }
        if (capName && capName.toLowerCase() !== "my" && capName.toLowerCase() !== "a") {
          return NextResponse.json({
            action: "select_capsule",
            value: capName,
            message: `Opening "${capName}" capsule.`,
          });
        }
        return NextResponse.json({ action: "navigate", value: "/capsule", message: "Opening Capsule." });
      }
      if (/\b(back|previous)\b/.test(lc)) {
        return NextResponse.json({ action: "navigate", value: "back", message: "Going back." });
      }
      if (/\b(home|homepage|landing|start)\b/.test(lc)) {
        return NextResponse.json({ action: "navigate", value: "/", message: "Opening Home." });
      }
      if (/\bcreate(\s*page)?\b/.test(lc) && !/\bpost\b/.test(lc)) {
        return NextResponse.json({ action: "navigate", value: "/create", message: "Opening Create." });
      }
      if (/\badmin\b/.test(lc)) {
        return NextResponse.json({ action: "navigate", value: "/admin", message: "Opening Admin." });
      }
    }

    if (/(create|make|start|set\s*up)\s+(a\s+)?capsule/.test(lc) || /\bnew\s+capsule\b/.test(lc)) {
      let capName: string | null = null;
      let aiName: string | null = null;
      try {
        const m1 = text.match(/(?:called|named)\s+\"?([A-Za-z0-9][A-Za-z0-9 _-]{1,40})\"?/i);
        if (m1?.[1]) capName = m1[1];
        const m2 = text.match(/ai\s+(?:called|named)\s+\"?([A-Za-z][A-Za-z0-9 _-]{1,30})\"?/i);
        if (m2?.[1]) aiName = m2[1];
        const m3 = text.match(/["?'?]([^"?'?]{1,40})["?'?]\s+capsule/i);
        if (!capName && m3?.[1]) capName = m3[1];
      } catch {
        // ignore extraction failures
      }
      const suggestions = ["Try a new name", "Make me a logo", "Switch my AI's name"];
      return NextResponse.json({
        action: "create_capsule",
        value: null,
        message: "Here's a starting point. Tweak anything you like and publish.",
        capsule: {
          name: capName || "My Capsule",
          aiName: aiName || "Assistant",
          bannerUrl: "",
          logoUrl: "",
          suggestions,
        },
      });
    }

    if (incomingPost) {
      const mediaUrl = typeof incomingPost.mediaUrl === "string" ? incomingPost.mediaUrl : null;
      const hasImage = Boolean(mediaUrl);
      const editIntent = /(edit|adjust|tweak|modify|change|remix|variation|variations|replace|remove background|replace background|crop|recolor|colorize|recolour|brighten|darken|make\b)/i.test(lc);
      const wantsNew = /(new|another|brand new|fresh|different image|generate)/i.test(lc);

      if (hasImage && editIntent && !options.force) {
        return NextResponse.json({
          action: "confirm_edit_choice",
          message: "Do you want me to edit the current image or create a new image based on your request?",
          choices: [
            { key: "edit_current", label: "Edit current image" },
            { key: "new_image", label: "Create new image" },
          ],
        });
      }

      if (options.force === "edit_current" && hasImage) {
        try {
          const base = buildBasePost(incomingPost);
          const combined = [base.mediaPrompt || "", text].filter(Boolean).join(" ");
          const editedUrl = await editImageWithInstruction(mediaUrl!, combined || text);
          const result = buildBasePost(base);
          result.kind = "image";
          result.mediaUrl = editedUrl;
          result.content = result.content || "Updated the image as requested.";
          result.mediaPrompt = combined || null;
          return NextResponse.json({ action: "draft_post", message: "Edited the current image.", post: result });
        } catch (error) {
          console.error("Edit current image failed:", error);
        }
      }

      if (options.force === "new_image" || wantsNew) {
        try {
          const url = await generateImageFromPrompt(text, { quality: "standard" });
          const result = buildBasePost(incomingPost);
          result.kind = "image";
          result.mediaUrl = url;
          result.mediaPrompt = text;
          result.content = result.content || "Here is a new visual.";
          return NextResponse.json({ action: "draft_post", message: "Created a new image.", post: result });
        } catch (error) {
          console.error("Generate new image (forced) failed:", error);
        }
      }

      const responsePayload = await refinePostDraft(text, incomingPost);
      return NextResponse.json(responsePayload);
    }

    const responsePayload = await createPostDraft(text);
    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error("AI prompt error:", error);
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if ((error as Error & { meta?: unknown }).meta) {
      console.error("OpenAI error meta:", (error as Error & { meta?: unknown }).meta);
    }
    return NextResponse.json({ error: "Failed to process AI request. Please try again." }, { status: 500 });
  }
}

