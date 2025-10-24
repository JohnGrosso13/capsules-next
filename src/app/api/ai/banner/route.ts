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
import { capsuleStyleSelectionSchema, type CapsuleArtAssetType } from "@/shared/capsule-style";
import type { CapsuleImageEvent } from "@/shared/ai-image-events";
import { Buffer } from "node:buffer";

const requestSchema = z.object({
  prompt: z.string().min(1),
  mode: z.enum(["generate", "edit"]).default("generate"),
  capsuleName: z.string().optional().nullable(),
  assetKind: z.enum(["banner", "storeBanner", "tile"]).default("banner"),
  style: capsuleStyleSelectionSchema.optional().nullable(),
  imageUrl: z.string().url().optional(),
  imageData: z.string().min(1).optional(),
});

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
      console.warn("ai.banner: failed to normalize remote image", error);
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
    console.warn("ai.banner: failed to store image to supabase", error);
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
    return returnError(401, "auth_required", "Sign in to customize capsule banners.");
  }

  const parsed = await parseJsonBody(req, requestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const { prompt, mode, capsuleName, imageUrl, imageData } = parsed.data;
  if (mode === "edit" && !imageUrl && !imageData) {
    return returnError(400, "invalid_request", "imageUrl or imageData is required to edit a banner.");
  }

  const assetKind = (parsed.data.assetKind ?? "banner") as CapsuleArtAssetType;
  const styleInput = parsed.data.style ?? null;
  const effectiveName = typeof capsuleName === "string" ? capsuleName : "";
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
        const message = error instanceof Error ? error.message : "Failed to update banner.";
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
              asset: assetKind,
              subjectName: effectiveName,
              style: styleInput ?? undefined,
            });
            const styleSummary = deriveStyleDebugSummary(built.style);

            send({
              type: "prompt",
              prompt: built.prompt,
              mode: "generate",
              assetKind,
              style: built.style,
              styleSummary,
            });

            const generated = await generateImageFromPrompt(built.prompt, {
              quality: "high",
              size: "1024x1024",
              retry: { attempts: 4, initialDelayMs: 900, multiplier: 1.7 },
              meta: {
                assetKind,
                mode: "generate",
                style: built.style,
                styleSummary,
                prompt: built.prompt,
                userPrompt: prompt,
                onEvent: send,
              },
            });

            const stored = await persistAndDescribeImage(generated, "capsule-banner-generate", {
              baseUrl: requestOrigin,
            });

            send({
              type: "success",
              url: stored.url,
              imageData: stored.imageData ?? null,
              mimeType: stored.mimeType ?? null,
              message:
                "Thanks for sharing that direction! I generated a new hero banner in that spirit - check out the preview on the right.",
              mode: "generate",
              assetKind,
            });

            finalize();
            return;
          }

          let sourceUrl = imageUrl ?? null;
          if (!sourceUrl && imageData) {
            const stored = await storeImageSrcToSupabase(imageData, "capsule-banner-source", {
              baseUrl: requestOrigin,
            });
            sourceUrl = stored?.url ?? null;
          }

          if (!sourceUrl) {
            fail(new Error("imageUrl or imageData is required to edit a banner."));
            return;
          }

          const normalizedSource = await (async () => {
            try {
              const stored = await storeImageSrcToSupabase(
                sourceUrl as string,
                "capsule-banner-source",
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
            asset: assetKind,
            subjectName: effectiveName,
            style: styleInput ?? undefined,
          });
          const editStyleSummary = deriveStyleDebugSummary(builtEdit.style);

          send({
            type: "prompt",
            prompt: builtEdit.prompt,
            mode: "edit",
            assetKind,
            style: builtEdit.style,
            styleSummary: editStyleSummary,
          });

          try {
            const edited = await editImageWithInstruction(normalizedSource, builtEdit.prompt, {
              quality: "high",
              size: "1024x1024",
              retry: { attempts: 3, initialDelayMs: 900, multiplier: 1.6 },
              meta: {
                assetKind,
                mode: "edit",
                style: builtEdit.style,
                styleSummary: editStyleSummary,
                prompt: builtEdit.prompt,
                userPrompt: prompt,
                onEvent: send,
              },
            });

            const stored = await persistAndDescribeImage(edited, "capsule-banner-edit", {
              baseUrl: requestOrigin,
            });

            send({
              type: "success",
              url: stored.url,
              imageData: stored.imageData ?? null,
              mimeType: stored.mimeType ?? null,
              message:
                "Thanks for the update! I remixed the current banner with those notes so you can preview the refresh.",
              mode: "edit",
              assetKind,
            });

            finalize();
            return;
          } catch (editError) {
            console.warn("ai.banner edit failed; falling back to fresh generation", editError);

            const fallbackBuilt = buildCapsuleArtGenerationPrompt({
              userPrompt: `${prompt}\nRemix inspired by the current banner, keep the same mood but refresh composition.`,
              asset: assetKind,
              subjectName: effectiveName,
              style: styleInput ?? undefined,
            });
            const fallbackSummary = deriveStyleDebugSummary(fallbackBuilt.style);

            send({
              type: "log",
              level: "warn",
              message: "Image edit failed, generating a fresh variation instead.",
            });

            send({
              type: "prompt",
              prompt: fallbackBuilt.prompt,
              mode: "fallback",
              assetKind,
              style: fallbackBuilt.style,
              styleSummary: fallbackSummary,
            });

            const fallback = await generateImageFromPrompt(fallbackBuilt.prompt, {
              quality: "high",
              size: "1024x1024",
              retry: { attempts: 3, initialDelayMs: 900, multiplier: 1.6 },
              meta: {
                assetKind,
                mode: "fallback",
                style: fallbackBuilt.style,
                styleSummary: fallbackSummary,
                prompt: fallbackBuilt.prompt,
                userPrompt: prompt,
                onEvent: send,
              },
            });

            const stored = await persistAndDescribeImage(fallback, "capsule-banner-edit-fallback", {
              baseUrl: requestOrigin,
            });

            send({
              type: "success",
              url: stored.url,
              imageData: stored.imageData ?? null,
              mimeType: stored.mimeType ?? null,
              message:
                "OpenAI couldn't edit the existing banner, so I generated a fresh take with your notes instead.",
              mode: "fallback",
              assetKind,
            });

            finalize();
            return;
          }
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
