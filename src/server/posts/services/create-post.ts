import { createPostRecord } from "@/lib/supabase/posts";
import type { CreatePostInput } from "@/server/posts/types";

export type CreatePostCommandInput = {
  ownerId: string;
  post: CreatePostInput;
};

export async function createPost(input: CreatePostCommandInput): Promise<string> {
  return createPostRecord(input.post, input.ownerId);
}
