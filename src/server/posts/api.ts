import { z } from "zod";

import { createPost } from "./services/create-post";
import type { CreatePostInput } from "@/server/posts/types";
import { createPostResponseSchema } from "@/server/validation/schemas/posts";
import { errorResponseSchema, type ErrorResponse } from "@/server/validation/http";
import { normalizeId, CapsuleMembershipError } from "@/server/capsules/domain/common";
import { requireCapsuleContentAccess } from "@/server/capsules/permissions";

type CreatePostResponse = z.infer<typeof createPostResponseSchema>;

type SlimSuccess<T> = { ok: true; status: number; body: T };
type SlimError = { ok: false; status: number; body: ErrorResponse };
export type SlimResponse<T> = SlimSuccess<T> | SlimError;

function slimSuccess<T extends z.ZodTypeAny>(
  schema: T,
  payload: z.infer<T>,
  status = 200,
): SlimSuccess<z.infer<T>> {
  const validated = schema.parse(payload);
  return { ok: true, status, body: validated };
}

function slimError(status: number, code: string, message: string, details?: unknown): SlimError {
  const payload = {
    error: code,
    message,
    ...(details === undefined ? {} : { details }),
  };
  const validated = errorResponseSchema.parse(payload);
  return { ok: false, status, body: validated };
}

export type CreatePostSlimInput = {
  post: CreatePostInput;
  ownerId: string;
};

export async function createPostSlim(
  options: CreatePostSlimInput,
): Promise<SlimResponse<CreatePostResponse>> {
  try {
    const postCapsuleId = (options.post as { capsuleId?: string | null; capsule_id?: string | null })
      .capsuleId;
    const postCapsuleIdAlt = (options.post as { capsule_id?: string | null }).capsule_id;
    const capsuleId = normalizeId(postCapsuleId ?? postCapsuleIdAlt ?? null);
    if (capsuleId) {
      await requireCapsuleContentAccess(capsuleId, options.ownerId);
    }

    const id = await createPost({ post: options.post, ownerId: options.ownerId });
    return slimSuccess(createPostResponseSchema, { success: true, id });
  } catch (error) {
    if (error instanceof CapsuleMembershipError) {
      return slimError(error.status, "forbidden", error.message);
    }
    console.error("Persist post error", error);
    return slimError(500, "post_save_failed", "Failed to save post");
  }
}
