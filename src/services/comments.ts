"use client";

export type CommentPayload = {
  id: string;
  postId: string;
  content: string;
  attachments: unknown[];
  capsuleId: string | null;
  capsule_id: string | null;
  ts: string;
  userName: string;
  userAvatar: string | null;
  source?: string;
};

export async function submitComment(
  comment: CommentPayload,
  userEnvelope: Record<string, unknown> | null,
): Promise<void> {
  const response = await fetch("/api/comments", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment, user: userEnvelope }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Failed to submit comment.");
  }
}
