import { ensureUserFromRequest } from "@/lib/auth/payload";
import { deriveRequestOrigin } from "@/lib/url";
import { shouldUseCloudflareImagesForOrigin } from "@/lib/cloudflare/runtime";
import type { IncomingUserPayload } from "@/lib/auth/payload";
import type { CreatePostInput } from "@/server/posts/types";
import { createPostSlim } from "@/server/posts/api";
import { PostsQueryError, queryPosts } from "@/server/posts/services/posts-query";
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
  const cloudflareEnabled = shouldUseCloudflareImagesForOrigin(requestOrigin);

  try {
    const result = await queryPosts({
      viewerId,
      origin: requestOrigin ?? null,
      cloudflareEnabled,
      query: {
        capsuleId: url.searchParams.get("capsuleId"),
        limit: url.searchParams.get("limit"),
        before: url.searchParams.get("before"),
        after: url.searchParams.get("after"),
      },
    });
    return validatedJson(postsResponseSchema, result, { status: 200 });
  } catch (error) {
    if (error instanceof PostsQueryError) {
      return returnError(error.status, error.code, error.message, error.details);
    }
    console.error("posts query failed", error);
    return returnError(500, "posts_fetch_failed", "Failed to load posts");
  }
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
