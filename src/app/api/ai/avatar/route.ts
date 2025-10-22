import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { generateImageFromPrompt, editImageWithInstruction } from "@/lib/ai/prompter";
import { storeImageSrcToSupabase } from "@/lib/supabase/storage";
import { deriveRequestOrigin, resolveToAbsoluteUrl } from "@/lib/url";
import { serverEnv } from "@/lib/env/server";
import { parseJsonBody, returnError } from "@/server/validation/http";
import {
  buildCapsuleArtEditInstruction,
  buildCapsuleArtGenerationPrompt,
  deriveStyleDebugSummary,
} from "@/server/ai/capsule-art/prompt-builders";
import { capsuleStyleSelectionSchema } from "@/shared/capsule-style";
import type { CapsuleImageEvent } from "@/shared/ai-image-events";
import { Buffer } from "node:buffer";
import {
  checkRateLimit,
  retryAfterSeconds as computeRetryAfterSeconds,
  type RateLimitDefinition,
} from "@/server/rate-limit";

const requestSchema = z.object({
  prompt: z.string().min(1),
  mode: z.enum(["generate", "edit"]).default("generate"),
  displayName: z.string().optional().nullable(),
  style: capsuleStyleSelectionSchema.optional().nullable(),
  imageUrl: z.string().url().optional(),
  imageData: z.string().min(1).optional(),
});

const AVATAR_RATE_LIMIT: RateLimitDefinition = {
  name: "ai.avatar",
  limit: 10,
  window: "30 m",
};

async function persistAndDescribeImage(
  source: string,
  filenameHint: string,
  options: { baseUrl?: string | null } = {},
): Promise<{ url: string; imageData: string | null; mimeType: string | null }> {
  const absoluteSource = resolveToAbsoluteUrl(source, options.baseUrl) ?? source;
  let normalizedSource = absoluteSource;
  let base64Data: string | null = null;
  let mimeType: string | null = null;

  if (/^data:/i.test(source)) {
    const match = source.match(/^data:([^;]+);base64,(.*)$/i);
    if (match) {
      mimeType = match[1] || "image/png";
      base64Data = match[2] || "";
    }
  } else {
    try {
      const response = await fetch(absoluteSource);
      if (response.ok) {
        const contentType = response.headers.get("content-type") || "image/png";
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        base64Data = buffer.toString("base64");
        mimeType = contentType;
        normalizedSource = `data:${contentType};base64,${base64Data}`;
      }
    } catch (error) {
      console.warn("ai.avatar: failed to normalize remote image", error);
    }
  }

  let storedUrl = absoluteSource;
  try {
    const stored = await storeImageSrcToSupabase(normalizedSource, filenameHint, {
      baseUrl: options.baseUrl ?? null,
    });
    if (stored?.url) {
      storedUrl = stored.url;
    }
  } catch (error) {
    console.warn("ai.avatar: failed to store image to supabase", error);
  }

  return {
    url: storedUrl,
    imageData: base64Data,
    mimeType,
  };
}

function writeEvent(controller: ReadableStreamDefaultController<Uint8Array>, event: CapsuleImageEvent) {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
}

export async function POST(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Sign in to customize your avatar.");
  }

  const parsed = await parseJsonBody(req, requestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const rateLimitResult = await checkRateLimit(AVATAR_RATE_LIMIT, ownerId);
  if (rateLimitResult && !rateLimitResult.success) {
    const retryAfterSeconds = computeRetryAfterSeconds(rateLimitResult.reset);
    return returnError(
      429,
      "rate_limited",
      "You’ve hit the avatar refresh limit. Give it a little time before trying again.",
      retryAfterSeconds === null ? undefined : { retryAfterSeconds },
    );
  }

  const { prompt, mode, displayName, imageUrl, imageData } = parsed.data;
  if (mode === "edit" && !imageUrl && !imageData) {
    return returnError(
      400,
      "invalid_request",
      "imageUrl or imageData is required to edit an avatar.",
    );
  }

  const styleInput = parsed.data.style ?? null;
  const effectiveName = typeof displayName === "string" ? displayName : "";
  const requestOrigin = deriveRequestOrigin(req) ?? serverEnv.SITE_URL;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: CapsuleImageEvent) => writeEvent(controller, event);
      const finalize = () => {
        try {
          controller.close();
        } catch {
          // ignore
        }
      };
      const fail = (error: unknown) => {
        const message = error instanceof Error ? error.message : "Failed to update avatar.";
        const status =
          typeof (error as { status?: unknown })?.status === "number"
            ? ((error as { status: number }).status ?? null)
            : null;
        const code =
          typeof (error as { code?: unknown }).code === "string"
            ? ((error as { code: string }).code ?? null)
            : null;
        send({
          type: "error",
          message,
          status: status ?? undefined,
          code: code ?? undefined,
        });
        finalize();
      };

      (async () => {
        try {
          if (mode === "generate") {
            const built = buildCapsuleArtGenerationPrompt({
              userPrompt: prompt,
              asset: "avatar",
              subjectName: effectiveName,
              style: styleInput ?? undefined,
            });
            const styleSummary = deriveStyleDebugSummary(built.style);

            send({
              type: "prompt",
              prompt: built.prompt,
              mode: "generate",
              assetKind: "avatar",
              style: built.style,
              styleSummary,
            });

            const generated = await generateImageFromPrompt(built.prompt, {
              quality: "high",
              size: "768x768",
              retry: { attempts: 4, initialDelayMs: 700, multiplier: 1.6 },
              meta: {
                assetKind: "avatar",
                mode: "generate",
                style: built.style,
                styleSummary,
                prompt: built.prompt,
                userPrompt: prompt,
                onEvent: send,
              },
            });

            const stored = await persistAndDescribeImage(generated, "profile-avatar-generate", {
              baseUrl: requestOrigin,
            });

            send({
              type: "success",
              url: stored.url,
              imageData: stored.imageData ?? null,
              mimeType: stored.mimeType ?? null,
              message:
                "Thanks for the direction! I generated a circular avatar that should look great throughout the product.",
              mode: "generate",
              assetKind: "avatar",
            });

            finalize();
            return;
          }

          let sourceUrl = imageUrl ?? null;
          if (!sourceUrl && imageData) {
            const stored = await storeImageSrcToSupabase(imageData, "profile-avatar-source", {
              baseUrl: requestOrigin,
            });
            sourceUrl = stored?.url ?? null;
          }

          if (!sourceUrl) {
            fail(new Error("imageUrl or imageData is required to edit an avatar."));
            return;
          }

          const normalizedSource = await (async () => {
            try {
              const stored = await storeImageSrcToSupabase(
                sourceUrl as string,
                "profile-avatar-source",
                {
                  baseUrl: requestOrigin,
                },
              );
              return stored?.url ?? sourceUrl!;
            } catch {
              return sourceUrl!;
            }
          })();

          const builtEdit = buildCapsuleArtEditInstruction({
            userPrompt: prompt,
            asset: "avatar",
            subjectName: effectiveName,
            style: styleInput ?? undefined,
          });
          const editStyleSummary = deriveStyleDebugSummary(builtEdit.style);

          send({
            type: "prompt",
            prompt: builtEdit.prompt,
            mode: "edit",
            assetKind: "avatar",
            style: builtEdit.style,
            styleSummary: editStyleSummary,
          });

          const edited = await editImageWithInstruction(normalizedSource, builtEdit.prompt, {
            quality: "high",
            size: "768x768",
            retry: { attempts: 3, initialDelayMs: 700, multiplier: 1.5 },
            meta: {
              assetKind: "avatar",
              mode: "edit",
              style: builtEdit.style,
              styleSummary: editStyleSummary,
              prompt: builtEdit.prompt,
              userPrompt: prompt,
              onEvent: send,
            },
          });

          const stored = await persistAndDescribeImage(edited, "profile-avatar-edit", {
            baseUrl: requestOrigin,
          });

          send({
            type: "success",
            url: stored.url,
            imageData: stored.imageData ?? null,
            mimeType: stored.mimeType ?? null,
            message:
              "Got it! I refreshed the avatar with those notes so you can review the update here.",
            mode: "edit",
            assetKind: "avatar",
          });

          finalize();
        } catch (error) {
          fail(error);
        }
      })().catch(fail);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
    },
  });
}

export const runtime = "nodejs";
