"use client";

export type AiImageRunToastsProps = {
  supabaseUserId?: string | null;
};

export function AiImageRunToasts({
  supabaseUserId: _supabaseUserId = null,
}: AiImageRunToastsProps) {
  // Toasts are disabled to avoid UI overlap; server logs and chat surface errors instead.
  return null;
}

export default AiImageRunToasts;
