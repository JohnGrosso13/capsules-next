import { ensureUserFromRequest } from "@/lib/auth/payload";
import { deriveRequestOrigin } from "@/lib/url";
import type { IncomingUserPayload } from "@/lib/auth/payload";
import type { CreatePostInput } from "@/server/posts/types";
import { createPostSlim, getPostsSlim } from "@/server/posts/api";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import {
  createPostRequestSchema,
  createPostResponseSchema,
  postsResponseSchema,
} from "@/server/validation/schemas/posts";

export const runtime = "nodejs";

export async function GET(req: Request) {
  let viewerId: string | null = null;

  try {
    viewerId = await ensureUserFromRequest(req, null, { allowGuests: false });
  } catch (viewerError) {
    console.warn("posts viewer resolve failed", viewerError);
  }

  const url = new URL(req.url);
  const requestOrigin = deriveRequestOrigin(req);
  const result = await getPostsSlim({
    viewerId,
    origin: requestOrigin ?? null,
    query: {
      capsuleId: url.searchParams.get("capsuleId"),
      limit: url.searchParams.get("limit"),
      before: url.searchParams.get("before"),
      after: url.searchParams.get("after"),
    },
  });

  if (!result.ok) {
    return returnError(result.status, result.body.error, result.body.message, result.body.details);
  }

  return validatedJson(postsResponseSchema, result.body, { status: result.status });
}

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, createPostRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const { post, user } = parsed.data;
  const userPayload = (user ?? {}) as IncomingUserPayload;

  const ownerId = await ensureUserFromRequest(req, userPayload, {
    allowGuests: process.env.NODE_ENV !== "production",
  });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  const result = await createPostSlim({ post: post as CreatePostInput, ownerId });
  if (!result.ok) {
    return returnError(result.status, result.body.error, result.body.message, result.body.details);
  }

  return validatedJson(createPostResponseSchema, result.body, { status: result.status });
}
